using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.Printing;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using Unimake.Business.DFe.Security;
using Unimake.Business.DFe.Servicos;
using Unimake.Business.DFe.Utility;
using Unimake.Business.DFe.Xml.NFe;
using Unimake.Unidanfe;
using Unimake.Unidanfe.Configurations;
using NfeAutorizacao = Unimake.Business.DFe.Servicos.NFe.Autorizacao;
using NfeConsultaProtocolo = Unimake.Business.DFe.Servicos.NFe.ConsultaProtocolo;
using NfeInutilizacao = Unimake.Business.DFe.Servicos.NFe.Inutilizacao;
using NfeRecepcaoEvento = Unimake.Business.DFe.Servicos.NFe.RecepcaoEvento;
using NfceAutorizacao = Unimake.Business.DFe.Servicos.NFCe.Autorizacao;
using NfceConsultaProtocolo = Unimake.Business.DFe.Servicos.NFCe.ConsultaProtocolo;
using NfceInutilizacao = Unimake.Business.DFe.Servicos.NFCe.Inutilizacao;
using NfceRecepcaoEvento = Unimake.Business.DFe.Servicos.NFCe.RecepcaoEvento;

namespace CaixaAgil.FiscalWorker;

internal static class Program
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static async Task<int> Main()
    {
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        try
        {
            var rawRequest = await Console.In.ReadToEndAsync();
            rawRequest = rawRequest.TrimStart('\uFEFF');

            if (string.IsNullOrWhiteSpace(rawRequest))
            {
                WriteResponse(FiscalResponse.Fail(
                    command: "desconhecido",
                    status: "entrada_invalida",
                    friendlyMessage: "O worker fiscal não recebeu dados para processar.",
                    technicalMessage: "STDIN vazio."));
                return 1;
            }

            var request = JsonSerializer.Deserialize<FiscalRequest>(rawRequest, SerializerOptions);

            if (request is null || string.IsNullOrWhiteSpace(request.Command))
            {
                WriteResponse(FiscalResponse.Fail(
                    command: request?.Command ?? "desconhecido",
                    status: "entrada_invalida",
                    friendlyMessage: "Comando fiscal inválido.",
                    technicalMessage: "Campo command ausente ou vazio."));
                return 1;
            }

            var response = Execute(request);
            WriteResponse(response);
            return response.Success ? 0 : 2;
        }
        catch (Exception error)
        {
            WriteResponse(FiscalResponse.Fail(
                command: "desconhecido",
                status: "erro_inesperado",
                friendlyMessage: "Falha inesperada no worker fiscal.",
                technicalMessage: error.ToString()));
            return 1;
        }
    }

    private static FiscalResponse Execute(FiscalRequest request)
    {
        return NormalizeCommand(request.Command) switch
        {
            "validar-configuracao" => ValidateConfiguration(request),
            "consultar-status-sefaz" => SefazStatusPending(request),
            "emitir-nfce" => EmitirDocumento(request, "65"),
            "emitir-nfce-contingencia" => EmitirDocumentoContingencia(request, "65"),
            "transmitir-nfce-contingencia" => TransmitirDocumentoContingencia(request, "65"),
            "emitir-nfe" => EmitirDocumento(request, "55"),
            "emitir-nfe-contingencia" => EmitirDocumentoContingencia(request, "55"),
            "transmitir-nfe-contingencia" => TransmitirDocumentoContingencia(request, "55"),
            "consultar-protocolo" => IntegrationPending(request, "consulta_protocolo_pendente", "Consulta de protocolo preparada para Unimake.DFe."),
            "cancelar" => CancelarDocumento(request),
            "inutilizar" => InutilizarNumero(request),
            "imprimir-danfe" => PrintDanfe(request),
            "reimprimir-danfe" => PrintDanfe(request),
            "gerar-pdf-danfe" => GenerateDanfePdfPending(request),
            "diagnosticar-impressora" => DiagnosePrinter(request),
            "listar-impressoras-disponiveis" => ListPrinters(request),
            _ => FiscalResponse.Fail(
                request.Command,
                "comando_nao_suportado",
                "Comando fiscal não suportado pelo worker.",
                $"Comando recebido: {request.Command}")
        };
    }

    private static FiscalResponse ValidateConfiguration(FiscalRequest request)
    {
        var config = FiscalConfig.FromJson(request.Config);
        var modelo = ResolveRequestModel(request);
        var issues = new List<string>();
        var technical = new List<string>();

        Require(config.Ambiente, "ambiente", issues);
        Require(config.Uf, "UF", issues);
        Require(config.Emitente.CnpjCpf, "CNPJ/CPF do emitente", issues);
        Require(config.Emitente.RazaoSocial, "razão social", issues);
        Require(config.Emitente.InscricaoEstadual, "inscrição estadual", issues);
        Require(config.Certificado.PfxPath, "certificado A1/PFX", issues);

        if (modelo == "65")
        {
            Require(config.Nfce.CscId, "ID CSC da NFC-e", issues);
            Require(config.Nfce.CscToken, "CSC/Token da NFC-e", issues);
            RequirePositive(config.Nfce.Serie, "série NFC-e", issues);
            RequireNonNegative(config.Nfce.UltimoNumero, "último número NFC-e", issues);
        }

        RequireDirectory(config.Diretorios.Xml, "diretório de XMLs", issues, technical);
        RequireDirectory(config.Diretorios.Logs, "diretório de logs", issues, technical);

        if (modelo == "55")
        {
            RequirePositive(config.Nfe.Serie, "serie NF-e", issues);
            RequireNonNegative(config.Nfe.UltimoNumero, "ultimo numero NF-e", issues);
        }

        var certificateInfo = ValidateCertificate(config.Certificado, issues, technical);
        var printerInfo = ValidateConfiguredPrinter(config.Impressao, issues, technical);

        var data = new Dictionary<string, object?>
        {
            ["ambiente"] = config.Ambiente,
            ["uf"] = config.Uf,
            ["modeloPrioritario"] = modelo,
            ["certificate"] = certificateInfo,
            ["printer"] = printerInfo,
            ["directories"] = new
            {
                xml = config.Diretorios.Xml,
                logs = config.Diretorios.Logs,
                pdf = config.Diretorios.Pdf
            },
            ["packages"] = new
            {
                dfe = "Unimake.DFe",
                danfe = "Unimake.Unidanfe.NET6"
            }
        };

        if (issues.Count > 0)
        {
            return FiscalResponse.Fail(
                request.Command,
                "configuracao_incompleta",
                string.Join(" ", issues),
                string.Join(" | ", technical),
                data);
        }

        return FiscalResponse.Ok(
            request.Command,
            "configuracao_valida",
            "Configuração fiscal validada para iniciar homologação.",
            string.Join(" | ", technical.Where(value => !string.IsNullOrWhiteSpace(value))),
            data);
    }

    private static FiscalResponse SefazStatusPending(FiscalRequest request)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = "Revise a configuração fiscal antes de consultar a SEFAZ."
            };
        }

        return IntegrationPending(
            request,
            "status_sefaz_pendente",
            "Consulta de status da SEFAZ preparada para Unimake.DFe. Configure certificado, UF e ambiente homologado para executar a chamada real.");
    }

    private static FiscalResponse EmitirDocumento(FiscalRequest request, string modelo)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = "Revise a configuração fiscal antes de emitir a nota."
            };
        }

        try
        {
            var config = FiscalConfig.FromJson(request.Config);
            var emission = BuildNfceEmission(config, request.Payload, modelo);
            var xml = BuildNfceXml(emission);
            var xmlPath = Path.Combine(config.Diretorios.Xml!, $"{emission.Chave}-nfe.xml");

            Directory.CreateDirectory(config.Diretorios.Xml!);
            File.WriteAllText(xmlPath, xml, Encoding.UTF8);

            var nfe = new NFe().LoadFromXML(xml);
            var enviNFe = new EnviNFe
            {
                Versao = "4.00",
                IdLote = emission.Numero.ToString(CultureInfo.InvariantCulture).PadLeft(15, '0'),
                IndSinc = SimNao.Sim,
                NFe = new List<NFe> { nfe }
            };
            var serviceConfig = BuildUnimakeNfceConfig(config, emission);
            var authorization = ExecuteAuthorization(emission, enviNFe, serviceConfig);

            var signedXmlPath = Path.Combine(config.Diretorios.Xml!, $"{emission.Chave}-assinado.xml");
            var signedXml = authorization.SignedXml;

            if (!string.IsNullOrWhiteSpace(signedXml))
            {
                File.WriteAllText(signedXmlPath, signedXml, Encoding.UTF8);
            }

            var cStat = authorization.CStat;
            var xMotivo = authorization.XMotivo;
            var procPath = Path.Combine(config.Diretorios.Xml!, $"{emission.Chave}-procNFe.xml");
            var procXml = authorization.ProcXml;

            if (!string.IsNullOrWhiteSpace(procXml) && cStat == 100)
            {
                File.WriteAllText(procPath, procXml, Encoding.UTF8);
            }

            var responseData = new Dictionary<string, object?>
            {
                ["documentId"] = GetString(request.Payload, "documentId"),
                ["modelo"] = modelo,
                ["serie"] = emission.Serie,
                ["numero"] = emission.Numero,
                ["chave"] = emission.Chave,
                ["protocolo"] = authorization.Protocolo,
                ["cStat"] = cStat,
                ["xMotivo"] = xMotivo,
                ["xmlEnviadoPath"] = xmlPath,
                ["xmlAssinadoPath"] = File.Exists(signedXmlPath) ? signedXmlPath : null,
                ["xmlAutorizadoPath"] = File.Exists(procPath) ? procPath : null,
                ["xmlProc"] = procXml,
                ["httpStatusCode"] = authorization.HttpStatusCode,
                ["adapter"] = "Unimake.DFe"
            };

            if (cStat == 100 && !string.IsNullOrWhiteSpace(authorization.Protocolo))
            {
                return FiscalResponse.Ok(
                    request.Command,
                    "autorizada",
                    $"{GetFiscalModelLabel(modelo)} autorizada pela SEFAZ: {cStat} - {xMotivo}",
                    null,
                    responseData);
            }

            var operatorMessage = BuildSefazOperatorMessage(cStat, xMotivo);

            if (IsContingencySefazResponse(cStat, xMotivo))
            {
                return EmitirNfceContingencia(
                    config,
                    request,
                    emission,
                    normalXmlPath: xmlPath,
                    normalSignedXmlPath: File.Exists(signedXmlPath) ? signedXmlPath : null,
                    reason: operatorMessage,
                    technicalMessage: authorization.RetornoWSString);
            }

            responseData["mensagemOperador"] = operatorMessage;

            return FiscalResponse.Fail(
                request.Command,
                IsDuplicateNumberResponse(cStat, xMotivo) ? "duplicidade_fiscal" : "rejeitada",
                operatorMessage,
                authorization.RetornoWSString,
                responseData);
        }
        catch (Exception error)
        {
            var operatorMessage = ExtractFiscalOperatorMessage(error);

            if (IsCommunicationFailure(error))
            {
                try
                {
                    var config = FiscalConfig.FromJson(request.Config);
                    var emission = BuildNfceEmission(config, request.Payload, modelo);

                    return EmitirNfceContingencia(
                        config,
                        request,
                        emission,
                        normalXmlPath: null,
                        normalSignedXmlPath: null,
                        reason: operatorMessage,
                        technicalMessage: error.ToString());
                }
                catch (Exception contingencyError)
                {
                    return FiscalResponse.Fail(
                        request.Command,
                        "erro_contingencia_nfce",
                        $"Não foi possível emitir a {GetFiscalModelLabel(modelo)} em contingencia.",
                        contingencyError.ToString(),
                        new
                        {
                            modelo,
                            adapter = "Unimake.DFe",
                            mensagemOperador = $"Não foi possível emitir a {GetFiscalModelLabel(modelo)} em contingencia.",
                            erroComunicacaoOriginal = operatorMessage,
                            tipoErro = contingencyError.GetType().Name
                        });
                }
            }

            return FiscalResponse.Fail(
                request.Command,
                "erro_emissao_nfce",
                operatorMessage,
                error.ToString(),
                new
                {
                    modelo,
                    adapter = "Unimake.DFe",
                    mensagemOperador = operatorMessage,
                    tipoErro = error.GetType().Name
                });
        }

    }

    private static FiscalResponse EmitirDocumentoContingencia(FiscalRequest request, string modelo)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = "Revise a configuração fiscal antes de emitir a nota."
            };
        }

        try
        {
            var config = FiscalConfig.FromJson(request.Config);
            var emission = BuildNfceEmission(config, request.Payload, modelo);

            return EmitirNfceContingencia(
                config,
                request,
                emission,
                normalXmlPath: null,
                normalSignedXmlPath: null,
                reason: GetString(request.Payload, "motivoContingencia") ?? "PDV operando sem comunicação com a SEFAZ",
                technicalMessage: "Contingência offline solicitada pelo PDV.");
        }
        catch (Exception error)
        {
            return FiscalResponse.Fail(
                request.Command,
                "erro_contingencia_nfce",
                $"Não foi possível emitir a {GetFiscalModelLabel(modelo)} em contingencia.",
                error.ToString(),
                new
                {
                    modelo,
                    adapter = "Unimake.DFe",
                    mensagemOperador = $"Não foi possível emitir a {GetFiscalModelLabel(modelo)} em contingencia.",
                    tipoErro = error.GetType().Name
                });
        }
    }

    private static FiscalResponse EmitirNfceContingencia(
        FiscalConfig config,
        FiscalRequest request,
        NfceEmission normalEmission,
        string? normalXmlPath,
        string? normalSignedXmlPath,
        string reason,
        string? technicalMessage)
    {
        var xJust = BuildContingencyJustification(reason);
        var contingencyEmission = BuildContingencyEmission(normalEmission, xJust);
        var contingencyXml = BuildNfceXml(contingencyEmission);
        var contingencyDir = Path.Combine(config.Diretorios.Xml!, "contingencia");
        var contingencyPath = Path.Combine(contingencyDir, $"{contingencyEmission.Chave}-nfe.xml");
        var signedPath = Path.Combine(contingencyDir, $"{contingencyEmission.Chave}-contingencia-assinado.xml");

        Directory.CreateDirectory(contingencyDir);
        File.WriteAllText(contingencyPath, contingencyXml, Encoding.UTF8);

        var signedXml = SignNfceXml(contingencyXml, config, contingencyEmission);
        File.WriteAllText(signedPath, signedXml, Encoding.UTF8);
        var modelLabel = GetFiscalModelLabel(contingencyEmission.Modelo);

        return FiscalResponse.Ok(
            request.Command,
            "contingencia_emitida",
            $"{modelLabel} emitida em contingencia offline.",
            technicalMessage,
            new Dictionary<string, object?>
            {
                ["documentId"] = GetString(request.Payload, "documentId"),
                ["modelo"] = contingencyEmission.Modelo,
                ["serie"] = contingencyEmission.Serie,
                ["numero"] = contingencyEmission.Numero,
                ["chave"] = contingencyEmission.Chave,
                ["protocolo"] = null,
                ["cStat"] = null,
                ["xMotivo"] = "Emitida em contingencia offline.",
                ["mensagemOperador"] = $"{modelLabel} emitida em contingencia offline. Transmita quando a internet voltar.",
                ["contingencia"] = true,
                ["tpEmis"] = contingencyEmission.TipoEmissao,
                ["dhCont"] = contingencyEmission.DhCont?.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture),
                ["xJust"] = xJust,
                ["xmlNormalPath"] = normalXmlPath,
                ["xmlNormalAssinadoPath"] = normalSignedXmlPath,
                ["xmlEnviadoPath"] = contingencyPath,
                ["xmlAssinadoPath"] = signedPath,
                ["xmlAutorizadoPath"] = signedPath,
                ["xmlContingenciaPath"] = signedPath,
                ["xmlProc"] = null,
                ["adapter"] = "Unimake.DFe",
                ["modoEmissao"] = "contingencia_offline"
            });
    }

    private static FiscalResponse TransmitirDocumentoContingencia(FiscalRequest request, string expectedModelo)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = $"Revise a configuração fiscal antes de transmitir a {GetFiscalModelLabel(expectedModelo)} em contingencia."
            };
        }

        var xmlPath = GetString(request.Payload, "xmlPath") ??
            GetString(request.Payload, "xmlContingenciaPath") ??
            GetString(request.Payload, "xmlAutorizadoPath") ??
            GetString(request.Payload, "xml_enviado_path");

        if (string.IsNullOrWhiteSpace(xmlPath) || !File.Exists(xmlPath))
        {
            return FiscalResponse.Fail(
                request.Command,
                "contingencia_xml_indisponivel",
                "XML de contingência não encontrado para transmissão.",
                $"Arquivo informado: {xmlPath}",
                new
                {
                    modelo = expectedModelo,
                    xmlPath,
                    mensagemOperador = "XML de contingência não encontrado para transmissão."
                });
        }

        try
        {
            var config = FiscalConfig.FromJson(request.Config);
            var emission = ReadNfceEmissionFromXml(config, xmlPath);
            var modelLabel = GetFiscalModelLabel(emission.Modelo);

            if (emission.Modelo != expectedModelo)
            {
                return FiscalResponse.Fail(
                    request.Command,
                    "contingencia_modelo_invalido",
                    $"O XML informado nÃ£o Ã© uma {GetFiscalModelLabel(expectedModelo)} em contingÃªncia.",
                    $"Modelo encontrado: {emission.Modelo}",
                    new
                    {
                        modelo = emission.Modelo,
                        modeloEsperado = expectedModelo,
                        xmlPath,
                        mensagemOperador = $"O XML informado nÃ£o Ã© uma {GetFiscalModelLabel(expectedModelo)} em contingÃªncia."
                    });
            }

            if (!IsContingencyEmissionType(emission))
            {
                return FiscalResponse.Fail(
                    request.Command,
                    "contingencia_xml_invalido",
                    $"O XML informado não é uma {modelLabel} emitida em contingencia.",
                    $"tpEmis encontrado: {emission.TipoEmissao}",
                    new
                    {
                        modelo = emission.Modelo,
                        serie = emission.Serie,
                        numero = emission.Numero,
                        chave = emission.Chave,
                        xmlPath,
                        mensagemOperador = $"O XML informado não é uma {modelLabel} emitida em contingencia."
                    });
            }

            var procPath = Path.Combine(config.Diretorios.Xml!, $"{emission.Chave}-procNFe.xml");

            if (TryReadAuthorizedNfceProc(procPath, emission.Chave, out var existingProcXml, out var existingProtocol, out var existingCStat, out var existingXMotivo))
            {
                return BuildAuthorizedContingencyResponse(
                    request.Command,
                    request.Payload,
                    emission,
                    xmlPath,
                    procPath,
                    existingProtocol,
                    existingCStat,
                    existingXMotivo,
                    existingProcXml);
            }

            var xml = File.ReadAllText(xmlPath, Encoding.UTF8);
            xml = PrepareNfceContingencyXmlForTransmission(xml, config, emission);
            var xmlDocument = new XmlDocument { PreserveWhitespace = true };
            xmlDocument.LoadXml(xml);
            var namespaceManager = new XmlNamespaceManager(xmlDocument.NameTable);
            namespaceManager.AddNamespace("nfe", "http://www.portalfiscal.inf.br/nfe");
            namespaceManager.AddNamespace("ds", "http://www.w3.org/2000/09/xmldsig#");

            if (xmlDocument.GetElementsByTagName("Signature", "http://www.w3.org/2000/09/xmldsig#").Count == 0)
            {
                return FiscalResponse.Fail(
                    request.Command,
                    "contingencia_xml_sem_assinatura",
                    "XML de contingência sem assinatura digital.",
                    "Assinatura XMLDSig não encontrada.",
                    new
                    {
                        modelo = emission.Modelo,
                        serie = emission.Serie,
                        numero = emission.Numero,
                        chave = emission.Chave,
                        xmlPath,
                        mensagemOperador = "XML de contingência sem assinatura digital."
                    });
            }

            if (emission.Modelo == "65")
            {
                AppendNfceSupplement(xmlDocument, namespaceManager, config, emission);
            }
            xml = xmlDocument.OuterXml;
            File.WriteAllText(xmlPath, xml, Encoding.UTF8);

            var serviceConfig = BuildUnimakeNfceConfig(config, emission);
            var envioXml = BuildNfceEnviNFeXml(xml, emission);
            var authorization = ExecuteAuthorization(emission, envioXml, serviceConfig);

            var cStat = authorization.CStat;
            var xMotivo = authorization.XMotivo;
            var procXml = authorization.ProcXml;

            Directory.CreateDirectory(config.Diretorios.Xml!);

            if (!string.IsNullOrWhiteSpace(procXml))
            {
                File.WriteAllText(procPath, procXml, Encoding.UTF8);
            }

            var responseData = new Dictionary<string, object?>
            {
                ["documentId"] = GetString(request.Payload, "documentId"),
                ["modelo"] = emission.Modelo,
                ["serie"] = emission.Serie,
                ["numero"] = emission.Numero,
                ["chave"] = emission.Chave,
                ["protocolo"] = authorization.Protocolo,
                ["cStat"] = cStat,
                ["xMotivo"] = xMotivo,
                ["mensagemOperador"] = BuildSefazOperatorMessage(cStat, xMotivo),
                ["contingencia"] = true,
                ["tpEmis"] = emission.TipoEmissao,
                ["dhCont"] = emission.DhCont?.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture),
                ["xJust"] = emission.XJust,
                ["xmlEnviadoPath"] = xmlPath,
                ["xmlAssinadoPath"] = xmlPath,
                ["xmlAutorizadoPath"] = File.Exists(procPath) ? procPath : null,
                ["xmlContingenciaPath"] = xmlPath,
                ["xmlProc"] = procXml,
                ["httpStatusCode"] = authorization.HttpStatusCode,
                ["adapter"] = "Unimake.DFe",
                ["modoEmissao"] = "transmissao_contingencia_offline"
            };

            if (cStat == 100 && !string.IsNullOrWhiteSpace(authorization.Protocolo))
            {
                responseData["mensagemOperador"] = $"{modelLabel} em contingencia transmitida e autorizada pela SEFAZ.";

                return FiscalResponse.Ok(
                    request.Command,
                    "autorizada",
                    $"{modelLabel} em contingencia autorizada pela SEFAZ: {cStat} - {xMotivo}",
                    null,
                    responseData);
            }

            if (IsDuplicateNumberResponse(cStat, xMotivo))
            {
                if (TryConsultAuthorizedNfceProtocol(config, emission, xml, procPath, out var recoveredProcXml, out var recoveredProtocol, out var recoveredCStat, out var recoveredXMotivo))
                {
                    return BuildAuthorizedContingencyResponse(
                        request.Command,
                        request.Payload,
                        emission,
                        xmlPath,
                        procPath,
                        recoveredProtocol,
                        recoveredCStat,
                        recoveredXMotivo,
                        recoveredProcXml);
                }

                if (cStat == 204 && !string.IsNullOrWhiteSpace(authorization.Protocolo))
                {
                    return BuildAuthorizedContingencyResponse(
                        request.Command,
                        request.Payload,
                        emission,
                        xmlPath,
                        procPath,
                        authorization.Protocolo,
                        cStat,
                        xMotivo,
                        procXml);
                }

                return FiscalResponse.Fail(
                    request.Command,
                    "duplicidade_fiscal",
                    $"SEFAZ informou duplicidade para a {modelLabel} em contingencia. Consulte a chave antes de tentar novamente.",
                    authorization.RetornoWSString,
                    responseData);
            }

            return FiscalResponse.Fail(
                request.Command,
                "rejeitada",
                BuildSefazOperatorMessage(cStat, xMotivo),
                authorization.RetornoWSString,
                responseData);
        }
        catch (Exception error)
        {
            var operatorMessage = ExtractFiscalOperatorMessage(error);
            var status = IsCommunicationFailure(error) ? "contingencia_transmissao_pendente" : "erro_transmissao_contingencia";

            return FiscalResponse.Fail(
                request.Command,
                status,
                IsCommunicationFailure(error)
                    ? "Sem comunicação com a SEFAZ para transmitir a contingência."
                    : operatorMessage,
                error.ToString(),
                new
                {
                    modelo = "65",
                    xmlPath,
                    adapter = "Unimake.DFe",
                    mensagemOperador = IsCommunicationFailure(error)
                        ? "Sem comunicação com a SEFAZ para transmitir a contingência."
                        : operatorMessage,
                    tipoErro = error.GetType().Name
                });
        }
    }

    private static FiscalResponse InutilizarNumero(FiscalRequest request)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = "Revise a configuracao fiscal antes de inutilizar a numeracao."
            };
        }

        try
        {
            var config = FiscalConfig.FromJson(request.Config);
            var modelo = ResolveRequestModel(request);
            var serie = ParseInt(GetString(request.Payload, "serie"), modelo == "55" ? config.Nfe.Serie ?? 1 : config.Nfce.Serie ?? 1);
            var numeroInicial = FirstInt(
                GetInt(request.Payload, "nNFIni"),
                GetInt(request.Payload, "numeroInicial"),
                GetInt(request.Payload, "numero_inicial"),
                GetInt(request.Payload, "numero"));
            var numeroFinal = FirstInt(
                GetInt(request.Payload, "nNFFin"),
                GetInt(request.Payload, "numeroFinal"),
                GetInt(request.Payload, "numero_final"),
                numeroInicial);

            if (serie <= 0 || !numeroInicial.HasValue || numeroInicial.Value <= 0 || !numeroFinal.HasValue || numeroFinal.Value < numeroInicial.Value)
            {
                return FiscalResponse.Fail(
                    request.Command,
                    "inutilizacao_dados_invalidos",
                    "Informe serie e numeracao valida para inutilizar.",
                    null,
                    new
                    {
                        modelo,
                        serie,
                        numeroInicial,
                        numeroFinal,
                        mensagemOperador = "Informe serie e numeracao valida para inutilizar."
                    });
            }

            var codigoUf = GetUfCode(config.Uf);
            var cnpjCpf = OnlyDigits(config.Emitente.CnpjCpf);
            var ano = ResolveInutilizationYear(request.Payload);
            var justificativa = BuildFiscalEventJustification(
                FirstNonBlank(
                    GetString(request.Payload, "justificativa"),
                    GetString(request.Payload, "xJust"),
                    GetString(request.Payload, "motivo")),
                "Erro tecnico na emissao fiscal do PDV.");
            var inutNFe = new InutNFe
            {
                Versao = "4.00",
                InfInut = new InutNFeInfInut
                {
                    Id = BuildInutilizationId(codigoUf, ano, cnpjCpf, modelo, serie, numeroInicial.Value, numeroFinal.Value),
                    TpAmb = ToUnimakeEnvironment(config.Ambiente),
                    XServ = "INUTILIZAR",
                    CUF = (UFBrasil)codigoUf,
                    Ano = ano,
                    Mod = modelo == "55" ? ModeloDFe.NFe : ModeloDFe.NFCe,
                    Serie = serie,
                    NNFIni = numeroInicial.Value,
                    NNFFin = numeroFinal.Value,
                    XJust = justificativa
                }
            };

            if (cnpjCpf.Length == 11)
            {
                inutNFe.InfInut.CPF = cnpjCpf;
            }
            else
            {
                inutNFe.InfInut.CNPJ = cnpjCpf.PadLeft(14, '0');
            }

            var serviceConfig = BuildUnimakeFiscalServiceConfig(config, modelo, codigoUf, "1");
            serviceConfig.Servico = Servico.NFeInutilizacao;
            object inutilizacao = modelo == "55"
                ? new NfeInutilizacao(inutNFe, serviceConfig)
                : new NfceInutilizacao(inutNFe, serviceConfig);

            ExecuteService(inutilizacao);

            var signedXml = GetPropertyValue(inutilizacao, "ConteudoXMLAssinado") as XmlDocument;
            var result = GetPropertyValue(inutilizacao, "Result");
            var procResult = GetPropertyValue(inutilizacao, "ProcInutNFeResult");
            var infInut = GetNestedPropertyValue(result, "InfInut") ??
                GetNestedPropertyValue(procResult, "RetInutNFe", "InfInut");
            var cStat = GetIntProperty(infInut, "CStat") ?? 0;
            var xMotivo = GetStringProperty(infInut, "XMotivo") ?? "Retorno fiscal sem motivo informado.";
            var protocolo = GetStringProperty(infInut, "NProt");
            var procXml = GetGeneratedXml(procResult);
            var eventDir = EnsureFiscalXmlSubdirectory(config, "inutilizacoes");
            var baseName = $"{modelo}-serie-{serie.ToString(CultureInfo.InvariantCulture).PadLeft(3, '0')}-{numeroInicial.Value.ToString(CultureInfo.InvariantCulture).PadLeft(9, '0')}";
            var signedPath = Path.Combine(eventDir, $"{baseName}-inutNFe.xml");
            var procPath = Path.Combine(eventDir, $"{baseName}-procInutNFe.xml");

            if (signedXml is not null)
            {
                File.WriteAllText(signedPath, signedXml.OuterXml, Encoding.UTF8);
            }

            if (!string.IsNullOrWhiteSpace(procXml))
            {
                File.WriteAllText(procPath, procXml, Encoding.UTF8);
            }

            var responseData = new Dictionary<string, object?>
            {
                ["documentId"] = GetString(request.Payload, "documentId"),
                ["modelo"] = modelo,
                ["serie"] = serie,
                ["numero"] = numeroInicial.Value,
                ["numeroInicial"] = numeroInicial.Value,
                ["numeroFinal"] = numeroFinal.Value,
                ["ano"] = ano,
                ["cStat"] = cStat,
                ["xMotivo"] = xMotivo,
                ["protocolo"] = protocolo,
                ["mensagemOperador"] = BuildFiscalEventOperatorMessage("Inutilizacao", cStat, xMotivo),
                ["xmlEnviadoPath"] = File.Exists(signedPath) ? signedPath : null,
                ["xmlAutorizadoPath"] = File.Exists(procPath) ? procPath : null,
                ["xmlProc"] = procXml,
                ["adapter"] = "Unimake.DFe"
            };

            if (IsInutilizationAccepted(cStat, xMotivo))
            {
                return FiscalResponse.Ok(
                    request.Command,
                    "inutilizada",
                    $"Numeracao {modelo} serie {serie} numero {numeroInicial.Value} inutilizada na SEFAZ.",
                    null,
                    responseData);
            }

            return FiscalResponse.Fail(
                request.Command,
                "inutilizacao_rejeitada",
                BuildFiscalEventOperatorMessage("Inutilizacao", cStat, xMotivo),
                GetStringProperty(inutilizacao, "RetornoWSString"),
                responseData);
        }
        catch (Exception error)
        {
            var operatorMessage = ExtractFiscalOperatorMessage(error);

            return FiscalResponse.Fail(
                request.Command,
                "erro_inutilizacao",
                operatorMessage,
                error.ToString(),
                new
                {
                    modelo = ResolveRequestModel(request),
                    mensagemOperador = operatorMessage,
                    tipoErro = error.GetType().Name,
                    adapter = "Unimake.DFe"
                });
        }
    }

    private static FiscalResponse CancelarDocumento(FiscalRequest request)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = "Revise a configuracao fiscal antes de cancelar a nota."
            };
        }

        try
        {
            var config = FiscalConfig.FromJson(request.Config);
            var modelo = ResolveRequestModel(request);
            var codigoUf = GetUfCode(config.Uf);
            var chave = OnlyDigits(FirstNonBlank(
                GetString(request.Payload, "chave"),
                GetString(request.Payload, "chaveAcesso"),
                GetString(request.Payload, "chNFe")));
            var xmlPath = FirstNonBlank(
                GetString(request.Payload, "xmlPath"),
                GetString(request.Payload, "xmlAutorizadoPath"),
                GetString(request.Payload, "xml_autorizado_path"));
            var protocolo = FirstNonBlank(
                GetString(request.Payload, "protocolo"),
                GetString(request.Payload, "nProt"),
                GetString(request.Payload, "protocoloAutorizacao"),
                TryReadAuthorizationProtocol(xmlPath, chave));
            var serie = ParseInt(GetString(request.Payload, "serie"), 0);
            var numero = ParseInt(GetString(request.Payload, "numero"), 0);

            if (chave.Length != 44 || string.IsNullOrWhiteSpace(protocolo))
            {
                return FiscalResponse.Fail(
                    request.Command,
                    "cancelamento_dados_invalidos",
                    "Informe chave e protocolo de autorizacao para cancelar a nota.",
                    null,
                    new
                    {
                        modelo,
                        serie = serie > 0 ? (int?)serie : null,
                        numero = numero > 0 ? (int?)numero : null,
                        chave = string.IsNullOrWhiteSpace(chave) ? null : chave,
                        mensagemOperador = "Informe chave e protocolo de autorizacao para cancelar a nota."
                    });
            }

            var cnpjCpf = OnlyDigits(config.Emitente.CnpjCpf);
            var justificativa = BuildFiscalEventJustification(
                FirstNonBlank(
                    GetString(request.Payload, "justificativa"),
                    GetString(request.Payload, "xJust"),
                    GetString(request.Payload, "motivo")),
                "Cancelamento da venda no PDV Caixa Agil.");
            var detEvento = new DetEventoCanc
            {
                Versao = "1.00",
                DescEvento = "Cancelamento",
                NProt = protocolo,
                XJust = justificativa
            };
            var infEvento = new InfEvento(detEvento)
            {
                Id = $"ID{((int)TipoEventoNFe.Cancelamento).ToString(CultureInfo.InvariantCulture)}{chave}01",
                COrgao = (UFBrasil)codigoUf,
                TpAmb = ToUnimakeEnvironment(config.Ambiente),
                ChNFe = chave,
                DhEvento = DateTimeOffset.Now,
                TpEvento = TipoEventoNFe.Cancelamento,
                NSeqEvento = 1,
                VerEvento = "1.00"
            };

            if (cnpjCpf.Length == 11)
            {
                infEvento.CPF = cnpjCpf;
            }
            else
            {
                infEvento.CNPJ = cnpjCpf.PadLeft(14, '0');
            }

            var envEvento = new EnvEvento
            {
                Versao = "1.00",
                IdLote = DateTimeOffset.Now.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture),
                Evento = new List<Evento>
                {
                    new()
                    {
                        Versao = "1.00",
                        InfEvento = infEvento
                    }
                }
            };
            var serviceConfig = BuildUnimakeFiscalServiceConfig(config, modelo, codigoUf, "1");
            serviceConfig.Servico = Servico.NFeRecepcaoEvento;
            object recepcaoEvento = modelo == "55"
                ? new NfeRecepcaoEvento(envEvento, serviceConfig)
                : new NfceRecepcaoEvento(envEvento, serviceConfig);

            ExecuteService(recepcaoEvento);

            var signedXml = GetPropertyValue(recepcaoEvento, "ConteudoXMLAssinado") as XmlDocument;
            var result = GetPropertyValue(recepcaoEvento, "Result");
            var retEvento = GetFirstEnumerableItem(GetPropertyValue(result, "RetEvento"));
            var infEventoRet = GetPropertyValue(retEvento, "InfEvento");
            var procResult = GetPropertyValue(recepcaoEvento, "ProcEventoNFeResult");
            var cStat = GetIntProperty(infEventoRet, "CStat") ?? GetIntProperty(result, "CStat") ?? 0;
            var xMotivo = GetStringProperty(infEventoRet, "XMotivo") ?? GetStringProperty(result, "XMotivo") ?? "Retorno fiscal sem motivo informado.";
            var protocoloCancelamento = GetStringProperty(infEventoRet, "NProt");
            var procXml = GetGeneratedXml(GetFirstEnumerableItem(procResult)) ?? GetGeneratedXml(procResult);
            var eventDir = EnsureFiscalXmlSubdirectory(config, "eventos");
            var signedPath = Path.Combine(eventDir, $"{chave}-cancelamento-envEvento.xml");
            var procPath = Path.Combine(eventDir, $"{chave}-procEventoCancelamento.xml");

            if (signedXml is not null)
            {
                File.WriteAllText(signedPath, signedXml.OuterXml, Encoding.UTF8);
            }

            if (!string.IsNullOrWhiteSpace(procXml))
            {
                File.WriteAllText(procPath, procXml, Encoding.UTF8);
            }

            var responseData = new Dictionary<string, object?>
            {
                ["documentId"] = GetString(request.Payload, "documentId"),
                ["modelo"] = modelo,
                ["serie"] = serie > 0 ? serie : null,
                ["numero"] = numero > 0 ? numero : null,
                ["chave"] = chave,
                ["protocolo"] = protocoloCancelamento,
                ["protocoloAutorizacao"] = protocolo,
                ["cStat"] = cStat,
                ["xMotivo"] = xMotivo,
                ["mensagemOperador"] = BuildFiscalEventOperatorMessage("Cancelamento", cStat, xMotivo),
                ["xmlEnviadoPath"] = File.Exists(signedPath) ? signedPath : null,
                ["xmlAutorizadoPath"] = File.Exists(procPath) ? procPath : null,
                ["xmlProc"] = procXml,
                ["adapter"] = "Unimake.DFe"
            };

            if (IsCancellationAccepted(cStat, xMotivo))
            {
                return FiscalResponse.Ok(
                    request.Command,
                    "cancelada",
                    $"{GetFiscalModelLabel(modelo)} cancelada na SEFAZ.",
                    null,
                    responseData);
            }

            return FiscalResponse.Fail(
                request.Command,
                "cancelamento_rejeitado",
                BuildFiscalEventOperatorMessage("Cancelamento", cStat, xMotivo),
                GetStringProperty(recepcaoEvento, "RetornoWSString"),
                responseData);
        }
        catch (Exception error)
        {
            var operatorMessage = ExtractFiscalOperatorMessage(error);

            return FiscalResponse.Fail(
                request.Command,
                "erro_cancelamento",
                operatorMessage,
                error.ToString(),
                new
                {
                    modelo = ResolveRequestModel(request),
                    mensagemOperador = operatorMessage,
                    tipoErro = error.GetType().Name,
                    adapter = "Unimake.DFe"
                });
        }
    }

    private static bool TryReadAuthorizedNfceProc(
        string procPath,
        string chave,
        out string? procXml,
        out string? protocolo,
        out int cStat,
        out string xMotivo)
    {
        procXml = null;
        protocolo = null;
        cStat = 0;
        xMotivo = string.Empty;

        if (!File.Exists(procPath))
        {
            return false;
        }

        try
        {
            var document = XDocument.Load(procPath, LoadOptions.PreserveWhitespace);
            var infProt = FirstXmlElement(document, "infProt");
            var procChave = OnlyDigits(ReadXmlValue(infProt, "chNFe"));

            cStat = ParseInt(ReadXmlValue(infProt, "cStat"), 0);
            protocolo = ReadXmlValue(infProt, "nProt");
            xMotivo = ReadXmlValue(infProt, "xMotivo");

            if (procChave != chave || cStat != 100 || string.IsNullOrWhiteSpace(protocolo))
            {
                return false;
            }

            procXml = File.ReadAllText(procPath, Encoding.UTF8);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static FiscalResponse BuildAuthorizedContingencyResponse(
        string command,
        JsonObject? payload,
        NfceEmission emission,
        string xmlPath,
        string procPath,
        string? protocolo,
        int cStat,
        string xMotivo,
        string? procXml)
    {
        var modelLabel = GetFiscalModelLabel(emission.Modelo);
        var operatorMessage = cStat == 204
            ? $"{modelLabel} em contingencia ja consta autorizada na SEFAZ para esta chave."
            : $"{modelLabel} em contingencia transmitida e autorizada pela SEFAZ.";

        var responseData = new Dictionary<string, object?>
        {
            ["documentId"] = GetString(payload, "documentId"),
            ["modelo"] = emission.Modelo,
            ["serie"] = emission.Serie,
            ["numero"] = emission.Numero,
            ["chave"] = emission.Chave,
            ["protocolo"] = protocolo,
            ["cStat"] = cStat,
            ["xMotivo"] = xMotivo,
            ["mensagemOperador"] = operatorMessage,
            ["contingencia"] = true,
            ["tpEmis"] = emission.TipoEmissao,
            ["dhCont"] = emission.DhCont?.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture),
            ["xJust"] = emission.XJust,
            ["xmlEnviadoPath"] = xmlPath,
            ["xmlAssinadoPath"] = xmlPath,
            ["xmlAutorizadoPath"] = File.Exists(procPath) ? procPath : null,
            ["xmlContingenciaPath"] = xmlPath,
            ["xmlProc"] = procXml,
            ["httpStatusCode"] = 200,
            ["adapter"] = "Unimake.DFe",
            ["modoEmissao"] = "transmissao_contingencia_offline"
        };

        return FiscalResponse.Ok(
            command,
            "autorizada",
            cStat == 204
                ? $"{modelLabel} em contingencia recuperada como autorizada pela SEFAZ para esta chave."
                : $"{modelLabel} em contingencia autorizada pela SEFAZ: {cStat} - {xMotivo}",
            null,
            responseData);
    }

    private static bool TryConsultAuthorizedNfceProtocol(
        FiscalConfig config,
        NfceEmission emission,
        string nfeXml,
        string procPath,
        out string? procXml,
        out string? protocolo,
        out int cStat,
        out string xMotivo)
    {
        procXml = null;
        protocolo = null;
        cStat = 0;
        xMotivo = string.Empty;

        try
        {
            var consultaConfig = BuildUnimakeNfceConfig(config, emission);
            consultaConfig.Servico = Servico.NFeConsultaProtocolo;
            object consulta = emission.Modelo == "55"
                ? new NfeConsultaProtocolo(
                    emission.Chave,
                    IsProduction(config.Ambiente) ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
                    consultaConfig)
                : new NfceConsultaProtocolo(
                    emission.Chave,
                    IsProduction(config.Ambiente) ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
                    consultaConfig);

            consulta.GetType().GetMethod("Executar")?.Invoke(consulta, null);

            var retornoXml = Convert.ToString(GetPropertyValue(consulta, "RetornoWSString"), CultureInfo.InvariantCulture);

            if (string.IsNullOrWhiteSpace(retornoXml))
            {
                return false;
            }

            var retornoDocument = new XmlDocument
            {
                PreserveWhitespace = true
            };

            retornoDocument.LoadXml(retornoXml);
            var namespaceManager = new XmlNamespaceManager(retornoDocument.NameTable);
            namespaceManager.AddNamespace("nfe", "http://www.portalfiscal.inf.br/nfe");

            var protocolElement = retornoDocument.SelectSingleNode("//nfe:protNFe", namespaceManager) as XmlElement;
            var infProt = retornoDocument.SelectSingleNode("//nfe:protNFe/nfe:infProt", namespaceManager) as XmlElement;

            if (protocolElement is null || infProt is null)
            {
                return false;
            }

            var protocolChave = OnlyDigits(ReadXmlChildValue(infProt, "chNFe"));
            cStat = ParseInt(ReadXmlChildValue(infProt, "cStat"), 0);
            protocolo = ReadXmlChildValue(infProt, "nProt");
            xMotivo = ReadXmlChildValue(infProt, "xMotivo");

            if (protocolChave != emission.Chave || cStat != 100 || string.IsNullOrWhiteSpace(protocolo))
            {
                return false;
            }

            procXml = BuildNfeProcXml(nfeXml, protocolElement);
            File.WriteAllText(procPath, procXml, Encoding.UTF8);

            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string BuildNfeProcXml(string nfeXml, XmlElement protocolElement)
    {
        var nfeDocument = new XmlDocument
        {
            PreserveWhitespace = true
        };

        nfeDocument.LoadXml(nfeXml);

        var nfeElement = nfeDocument.DocumentElement?.LocalName == "nfeProc"
            ? nfeDocument.GetElementsByTagName("NFe", "http://www.portalfiscal.inf.br/nfe").OfType<XmlElement>().FirstOrDefault()
            : nfeDocument.DocumentElement;

        if (nfeElement is null)
        {
            throw new InvalidOperationException("XML da NFC-e sem elemento NFe.");
        }

        var procDocument = new XmlDocument
        {
            PreserveWhitespace = true
        };
        var nfeProc = procDocument.CreateElement("nfeProc", "http://www.portalfiscal.inf.br/nfe");
        nfeProc.SetAttribute("versao", "4.00");
        procDocument.AppendChild(nfeProc);
        nfeProc.AppendChild(procDocument.ImportNode(nfeElement, true));
        nfeProc.AppendChild(procDocument.ImportNode(protocolElement, true));

        return procDocument.OuterXml;
    }

    private static string ReadXmlChildValue(XmlElement element, string localName)
    {
        return element
            .ChildNodes
            .OfType<XmlElement>()
            .FirstOrDefault(child => child.LocalName == localName)
            ?.InnerText
            ?.Trim() ?? string.Empty;
    }

    private static bool IsDuplicateNumberResponse(int cStat, string? xMotivo)
    {
        return cStat is 204 or 539 ||
            (xMotivo ?? string.Empty).Contains("Duplicidade de NF-e", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsContingencySefazResponse(int cStat, string? xMotivo)
    {
        if (cStat is 108 or 109)
        {
            return true;
        }

        var message = Regex.Replace(xMotivo ?? string.Empty, "\\s+", " ").Trim();

        return cStat == 999 &&
            Regex.IsMatch(message, "paralisad|indispon|timeout|tempo limite|comunica|conex|webservice", RegexOptions.IgnoreCase);
    }

    private static string BuildSefazOperatorMessage(int cStat, string? xMotivo)
    {
        var message = Regex.Replace(xMotivo ?? string.Empty, "\\s+", " ").Trim();

        if (IsDuplicateNumberResponse(cStat, message))
        {
            return "Numeração da NFC-e já utilizada na SEFAZ. O PDV ajustou a próxima numeração e vai tentar novamente.";
        }

        message = Regex.Replace(message, @"\s*\[[^\]]+\]", "", RegexOptions.IgnoreCase).Trim();

        if (string.IsNullOrWhiteSpace(message))
        {
            return $"SEFAZ rejeitou a NFC-e com o código {cStat}.";
        }

        if (message.Length > 180)
        {
            message = message[..180].TrimEnd('.', ' ', ';', ':') + ".";
        }

        return $"SEFAZ {cStat}: {message}";
    }

    private static string ExtractFiscalOperatorMessage(Exception error)
    {
        var raw = error.Message;

        if (string.IsNullOrWhiteSpace(raw))
        {
            return "Não foi possível emitir a NFC-e.";
        }

        var message = Regex.Replace(raw, "\\s+", " ").Trim();
        var validationMatch = Regex.Match(message, @"(?:Erro:\s*)?(?<msg>.*?)(?:\s+at\s+|$)", RegexOptions.IgnoreCase);

        if (validationMatch.Success && !string.IsNullOrWhiteSpace(validationMatch.Groups["msg"].Value))
        {
            message = validationMatch.Groups["msg"].Value.Trim();
        }

        message = Regex.Replace(message, @"^\s*Unimake\.[^:]+:\s*", "", RegexOptions.IgnoreCase).Trim();
        message = Regex.Replace(message, @"^\s*In[ií]cio da valida[cç][aã]o\.\.\.\s*", "", RegexOptions.IgnoreCase).Trim();
        message = Regex.Replace(message, @"Linha:\s*\d+\s+Coluna:\s*\d+\s*", "", RegexOptions.IgnoreCase).Trim();
        message = Regex.Replace(message, @"\[[^\]]*<[^\]]+\][^\]]*\]", "", RegexOptions.IgnoreCase).Trim();
        message = Regex.Replace(message, @"\s*\.\.\.Final da valida[cç][aã]o.*$", "", RegexOptions.IgnoreCase).Trim();

        if (message.Contains("O CST do grupo de tributação do PIS", StringComparison.OrdinalIgnoreCase))
        {
            return "CST de PIS inválido para o produto. Revise o grupo fiscal do item.";
        }

        if (message.Contains("O CST do grupo de tributação do COFINS", StringComparison.OrdinalIgnoreCase))
        {
            return "CST de COFINS inválido para o produto. Revise o grupo fiscal do item.";
        }

        if (message.Contains("Código Regime Tributário do emitente diverge", StringComparison.OrdinalIgnoreCase))
        {
            return "Regime tributário do emitente diverge do cadastro na SEFAZ.";
        }

        if (message.Contains("Duplicidade de NF-e", StringComparison.OrdinalIgnoreCase))
        {
            return "Já existe uma NFC-e com esta numeração na SEFAZ. Avance a numeração e tente novamente.";
        }

        if (message.Length > 260)
        {
            message = message[..260].TrimEnd('.', ' ', ';', ':') + ".";
        }

        return string.IsNullOrWhiteSpace(message)
            ? "Não foi possível emitir a NFC-e."
            : message;
    }

    private static bool IsCommunicationFailure(Exception error)
    {
        for (Exception? current = error; current is not null; current = current.InnerException)
        {
            if (current is TimeoutException ||
                current is TaskCanceledException ||
                current is System.Net.Http.HttpRequestException ||
                current is System.Net.Sockets.SocketException)
            {
                return true;
            }
        }

        var message = Regex.Replace(error.ToString(), "\\s+", " ").Trim();

        return Regex.IsMatch(
            message,
            "host n[aã]o .*conhecido|no such host|name or service not known|could not resolve|remote name could not be resolved|timeout|timed out|tempo limite|connection refused|conex[aã]o recusada|network is unreachable|rede .*inacess|unable to connect|falha .*conex|erro .*conex|webservice .*indispon",
            RegexOptions.IgnoreCase);
    }

    private static string BuildContingencyJustification(string? reason)
    {
        var normalizedReason = Regex.Replace(reason ?? string.Empty, "\\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(normalizedReason))
        {
            normalizedReason = "falha de comunicação com a SEFAZ";
        }

        normalizedReason = Regex.Replace(normalizedReason, @"\s*\[[^\]]+\]", "", RegexOptions.IgnoreCase).Trim();
        var text = $"Falha de comunicação com a SEFAZ: {normalizedReason}";

        if (text.Length < 15)
        {
            text = "Falha de comunicação com a SEFAZ";
        }

        return text.Length > 256 ? text[..256].TrimEnd('.', ' ', ';', ':') : text;
    }

    private static NfceEmission BuildContingencyEmission(NfceEmission normalEmission, string xJust)
    {
        var dhCont = DateTimeOffset.Now;
        var tipoEmissao = GetContingencyEmissionType(normalEmission);
        var chave = BuildAccessKey(
            normalEmission.CodigoUf,
            normalEmission.IssueDate,
            OnlyDigits(normalEmission.Emitter.CnpjCpf).PadLeft(14, '0'),
            normalEmission.Modelo,
            normalEmission.Serie,
            normalEmission.Numero,
            normalEmission.CNf,
            tipoEmissao);

        return normalEmission with
        {
            TipoEmissao = tipoEmissao,
            CDv = chave[^1].ToString(),
            Chave = chave,
            DhCont = dhCont,
            XJust = xJust
        };
    }

    private static string SignNfceXml(string xml, FiscalConfig config, NfceEmission emission)
    {
        return SignNfceXmlOffline(xml, config, emission);
    }

    private static string PrepareNfceContingencyXmlForTransmission(string xml, FiscalConfig config, NfceEmission emission)
    {
        var document = new XmlDocument
        {
            PreserveWhitespace = true
        };

        document.LoadXml(xml);
        var namespaceManager = new XmlNamespaceManager(document.NameTable);
        namespaceManager.AddNamespace("nfe", "http://www.portalfiscal.inf.br/nfe");
        namespaceManager.AddNamespace("ds", "http://www.w3.org/2000/09/xmldsig#");

        foreach (var signature in document
            .GetElementsByTagName("Signature", "http://www.w3.org/2000/09/xmldsig#")
            .OfType<XmlElement>()
            .ToList())
        {
            signature.ParentNode?.RemoveChild(signature);
        }

        var supplements = document.SelectNodes("/nfe:NFe/nfe:infNFeSupl", namespaceManager);

        foreach (var supplement in supplements?.OfType<XmlElement>().ToList() ?? new List<XmlElement>())
        {
            supplement.ParentNode?.RemoveChild(supplement);
        }

        return SignNfceXmlOffline(document.OuterXml, config, emission);
    }

    private static string BuildNfceEnviNFeXml(string nfeXml, NfceEmission emission)
    {
        var nfeDocument = new XmlDocument
        {
            PreserveWhitespace = true
        };

        nfeDocument.LoadXml(nfeXml);

        if (nfeDocument.DocumentElement is null)
        {
            throw new InvalidOperationException("XML da NFC-e sem elemento raiz.");
        }

        var envioDocument = new XmlDocument
        {
            PreserveWhitespace = true
        };
        var enviNFe = envioDocument.CreateElement("enviNFe", "http://www.portalfiscal.inf.br/nfe");
        enviNFe.SetAttribute("versao", "4.00");
        envioDocument.AppendChild(enviNFe);

        var idLote = envioDocument.CreateElement("idLote", "http://www.portalfiscal.inf.br/nfe");
        idLote.InnerText = emission.Numero.ToString(CultureInfo.InvariantCulture).PadLeft(15, '0');
        enviNFe.AppendChild(idLote);

        var indSinc = envioDocument.CreateElement("indSinc", "http://www.portalfiscal.inf.br/nfe");
        indSinc.InnerText = "1";
        enviNFe.AppendChild(indSinc);

        enviNFe.AppendChild(envioDocument.ImportNode(nfeDocument.DocumentElement, true));

        return envioDocument.OuterXml;
    }

    private static Unimake.Business.DFe.Servicos.Configuracao BuildUnimakeNfceConfig(FiscalConfig config, NfceEmission emission)
    {
        return BuildUnimakeFiscalServiceConfig(config, emission.Modelo, emission.CodigoUf, emission.TipoEmissao);
    }

    private static Unimake.Business.DFe.Servicos.Configuracao BuildUnimakeFiscalServiceConfig(FiscalConfig config, string modelo, int codigoUf, string? tipoEmissao)
    {
        var certificado = new X509Certificate2(
            config.Certificado.PfxPath!,
            config.Certificado.PfxPassword ?? string.Empty,
            X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.Exportable);

        return new Unimake.Business.DFe.Servicos.Configuracao
        {
            TipoDFe = modelo == "55" ? TipoDFe.NFe : TipoDFe.NFCe,
            Modelo = modelo == "55" ? ModeloDFe.NFe : ModeloDFe.NFCe,
            Servico = Servico.NFeAutorizacao,
            TipoAmbiente = ToUnimakeEnvironment(config.Ambiente),
            TipoEmissao = ToUnimakeTipoEmissao(tipoEmissao),
            CodigoUF = codigoUf,
            CertificadoDigital = certificado,
            CertificadoArquivo = config.Certificado.PfxPath,
            CertificadoSenha = config.Certificado.PfxPassword,
            CSCIDToken = ParseInt(config.Nfce.CscId, 1),
            CSC = config.Nfce.CscToken,
            VersaoQRCodeNFCe = 2,
            TimeOutWebServiceConnect = 120000
        };
    }

    private static string SignNfceXmlOffline(string xml, FiscalConfig config, NfceEmission emission)
    {
        var certificado = new X509Certificate2(
            config.Certificado.PfxPath!,
            config.Certificado.PfxPassword ?? string.Empty,
            X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.Exportable);
        var document = new XmlDocument
        {
            PreserveWhitespace = true
        };

        document.LoadXml(xml);
        AssinaturaDigital.Assinar(
            document,
            "NFe",
            "infNFe",
            certificado,
            AlgorithmType.Sha1,
            true,
            "Id",
            true,
            false);

        MoveNfceSignatureToSchemaPosition(document);

        if (document.GetElementsByTagName("Signature", "http://www.w3.org/2000/09/xmldsig#").Count == 0)
        {
            throw new InvalidOperationException("XML de contingÃªncia nÃ£o foi assinado.");
        }

        var namespaceManager = new XmlNamespaceManager(document.NameTable);
        namespaceManager.AddNamespace("nfe", "http://www.portalfiscal.inf.br/nfe");
        namespaceManager.AddNamespace("ds", "http://www.w3.org/2000/09/xmldsig#");

        var infNfe = document.SelectSingleNode("//nfe:infNFe", namespaceManager) as XmlElement;
        var signedTpEmis = document.SelectSingleNode("//nfe:ide/nfe:tpEmis", namespaceManager)?.InnerText;
        var signedChave = OnlyDigits(infNfe?.GetAttribute("Id") ?? string.Empty);

        if (signedTpEmis != emission.TipoEmissao || signedChave != emission.Chave)
        {
            throw new InvalidOperationException("XML de contingÃªncia assinado diverge da chave ou do tipo de emissÃ£o.");
        }

        if (emission.Modelo == "65")
        {
            AppendNfceSupplement(document, namespaceManager, config, emission);
        }
        MoveNfceSignatureToSchemaPosition(document);

        return document.OuterXml;
    }

    private static void MoveNfceSignatureToSchemaPosition(XmlDocument document)
    {
        var nfeElement = document.DocumentElement;

        if (nfeElement is null)
        {
            return;
        }

        var signatureElement = document
            .GetElementsByTagName("Signature", "http://www.w3.org/2000/09/xmldsig#")
            .OfType<XmlElement>()
            .FirstOrDefault();

        if (signatureElement is null)
        {
            return;
        }

        if (signatureElement.ParentNode != nfeElement)
        {
            signatureElement.ParentNode?.RemoveChild(signatureElement);
            nfeElement.AppendChild(signatureElement);
            return;
        }

        if (signatureElement.NextSibling is not null)
        {
            nfeElement.RemoveChild(signatureElement);
            nfeElement.AppendChild(signatureElement);
        }
    }

    private static string SignNfceXmlOfflineOld(string xml, FiscalConfig config, NfceEmission emission)
    {
        var certificado = new X509Certificate2(
            config.Certificado.PfxPath!,
            config.Certificado.PfxPassword ?? string.Empty,
            X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.Exportable);
        var document = new XmlDocument
        {
            PreserveWhitespace = true
        };

        document.LoadXml(xml);
        AssinaturaDigital.Assinar(
            document,
            "infNFe",
            certificado,
            AlgorithmType.Sha1,
            true,
            false);

        if (document.GetElementsByTagName("Signature", "http://www.w3.org/2000/09/xmldsig#").Count == 0)
        {
            throw new InvalidOperationException("XML de contingência não foi assinado.");
        }

        var namespaceManager = new XmlNamespaceManager(document.NameTable);
        namespaceManager.AddNamespace("nfe", "http://www.portalfiscal.inf.br/nfe");
        namespaceManager.AddNamespace("ds", "http://www.w3.org/2000/09/xmldsig#");

        var infNfe = document.SelectSingleNode("//nfe:infNFe", namespaceManager) as XmlElement;
        var signedTpEmis = document.SelectSingleNode("//nfe:ide/nfe:tpEmis", namespaceManager)?.InnerText;
        var signedChave = OnlyDigits(infNfe?.GetAttribute("Id") ?? string.Empty);

        if (signedTpEmis != "9" || signedChave != emission.Chave)
        {
            throw new InvalidOperationException("XML de contingência assinado diverge da chave ou do tipo de emissão.");
        }

        AppendNfceSupplement(document, namespaceManager, config, emission);

        return document.OuterXml;
    }

    private static void AppendNfceSupplement(
        XmlDocument document,
        XmlNamespaceManager namespaceManager,
        FiscalConfig config,
        NfceEmission emission)
    {
        var nfeElement = document.DocumentElement ??
            throw new InvalidOperationException("XML da NFC-e sem elemento raiz.");
        var signatureElement = FindDirectChild(
            nfeElement,
            "Signature",
            "http://www.w3.org/2000/09/xmldsig#");
        var currentSupplement = document.SelectSingleNode("/nfe:NFe/nfe:infNFeSupl", namespaceManager);

        if (currentSupplement is not null)
        {
            nfeElement.RemoveChild(currentSupplement);
        }

        var qrCode = BuildNfceQrCodeUrl(document, namespaceManager, config, emission);
        var urlChave = GetNfceConsultaUrl(emission.Uf, emission.Ambiente);
        var supplement = document.CreateElement("infNFeSupl", "http://www.portalfiscal.inf.br/nfe");
        var qrCodeElement = document.CreateElement("qrCode", "http://www.portalfiscal.inf.br/nfe");
        var urlChaveElement = document.CreateElement("urlChave", "http://www.portalfiscal.inf.br/nfe");

        qrCodeElement.InnerText = qrCode;
        urlChaveElement.InnerText = urlChave;
        supplement.AppendChild(qrCodeElement);
        supplement.AppendChild(urlChaveElement);

        if (signatureElement is not null)
        {
            nfeElement.InsertBefore(supplement, signatureElement);
            return;
        }

        nfeElement.AppendChild(supplement);
    }

    private static string BuildNfceQrCodeUrl(
        XmlDocument document,
        XmlNamespaceManager namespaceManager,
        FiscalConfig config,
        NfceEmission emission)
    {
        var tpAmb = emission.Ambiente == "producao" ? "1" : "2";
        var digestValue = document
            .GetElementsByTagName("DigestValue", "http://www.w3.org/2000/09/xmldsig#")
            .OfType<XmlElement>()
            .FirstOrDefault()
            ?.InnerText
            ?.Trim();
        var digestValueHex = ToHex(digestValue ?? string.Empty);
        var cscId = OnlyDigits(config.Nfce.CscId).TrimStart('0');
        var total = FormatDecimal(emission.Lines.Sum(line => line.TotalPrice), 2);

        if (string.IsNullOrWhiteSpace(digestValue))
        {
            throw new InvalidOperationException("DigestValue da NFC-e não encontrado para gerar QR Code.");
        }

        if (string.IsNullOrWhiteSpace(cscId))
        {
            cscId = "1";
        }

        var qrFields = new[]
        {
            emission.Chave,
            "2",
            tpAmb,
            emission.IssueDate.ToString("dd", CultureInfo.InvariantCulture),
            total,
            digestValueHex,
            cscId
        };
        var qrPayload = string.Join("|", qrFields);
        var hash = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(qrPayload + config.Nfce.CscToken)));

        return $"{GetNfceQrCodeBaseUrl(emission.Uf, emission.Ambiente)}?p={qrPayload}|{hash}";
    }

    private static XmlNode? FindDirectChild(XmlNode parent, string localName, string namespaceUri)
    {
        foreach (XmlNode child in parent.ChildNodes)
        {
            if (child.LocalName == localName && child.NamespaceURI == namespaceUri)
            {
                return child;
            }
        }

        return null;
    }

    private static string GetNfceQrCodeBaseUrl(string uf, string ambiente)
    {
        var normalizedUf = NormalizeUf(uf);
        var homologacao = ambiente != "producao";

        return normalizedUf switch
        {
            "SP" when homologacao => "https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx",
            "SP" => "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx",
            _ when homologacao => "https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx",
            _ => "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx"
        };
    }

    private static string GetNfceConsultaUrl(string uf, string ambiente)
    {
        var normalizedUf = NormalizeUf(uf);
        var homologacao = ambiente != "producao";

        return normalizedUf switch
        {
            "SP" when homologacao => "https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/",
            "SP" => "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/",
            _ when homologacao => "https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/",
            _ => "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/"
        };
    }

    private static NfceEmission ReadNfceEmissionFromXml(FiscalConfig config, string xmlPath)
    {
        var document = XDocument.Load(xmlPath, LoadOptions.PreserveWhitespace);
        var infNFe = FirstXmlElement(document, "infNFe") ?? throw new InvalidOperationException("XML da NFC-e sem infNFe.");
        var ide = FirstXmlElement(infNFe, "ide") ?? throw new InvalidOperationException("XML da NFC-e sem ide.");
        var emit = FirstXmlElement(infNFe, "emit");
        var ender = FirstXmlElement(emit, "enderEmit");
        var icmsTotal = FirstXmlElement(infNFe, "ICMSTot");
        var chave = OnlyDigits(infNFe.Attribute("Id")?.Value);

        if (chave.Length > 44)
        {
            chave = chave[^44..];
        }

        if (chave.Length != 44)
        {
            throw new InvalidOperationException("Chave de acesso da NFC-e não encontrada no XML.");
        }

        var dhEmiText = ReadXmlValue(ide, "dhEmi");
        var dhContText = ReadXmlValue(ide, "dhCont");
        var modelo = ReadXmlValue(ide, "mod") == "55" ? "55" : "65";
        var serieFallback = modelo == "55" ? config.Nfe.Serie ?? 1 : config.Nfce.Serie ?? 1;
        var numeroFallback = modelo == "55" ? config.Nfe.UltimoNumero ?? 1 : config.Nfce.UltimoNumero ?? 1;
        var issueDate = DateTimeOffset.TryParse(dhEmiText, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedIssueDate)
            ? parsedIssueDate
            : DateTimeOffset.Now;
        DateTimeOffset? dhCont = DateTimeOffset.TryParse(dhContText, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedDhCont)
            ? parsedDhCont
            : null;

        return new NfceEmission(
            Modelo: modelo,
            Ambiente: ReadXmlValue(ide, "tpAmb") == "1" ? "producao" : "homologacao",
            CodigoUf: ParseInt(ReadXmlValue(ide, "cUF"), GetUfCode(config.Uf)),
            Uf: NormalizeUf(ReadXmlValue(ender, "UF") ?? config.Uf),
            Serie: ParseInt(ReadXmlValue(ide, "serie"), serieFallback),
            Numero: ParseInt(ReadXmlValue(ide, "nNF"), numeroFallback),
            CNf: OnlyDigits(ReadXmlValue(ide, "cNF")).PadLeft(8, '0'),
            CDv: OnlyDigits(ReadXmlValue(ide, "cDV")) is { Length: > 0 } cDv ? cDv[^1].ToString() : chave[^1].ToString(),
            Chave: chave,
            IssueDate: issueDate,
            TipoEmissao: OnlyDigits(ReadXmlValue(ide, "tpEmis")),
            DhCont: dhCont,
            XJust: ReadXmlValue(ide, "xJust"),
            PaymentMethod: "dinheiro",
            Emitter: config.Emitente,
            Recipient: null,
            Lines: new List<NfceLine>
            {
                new(
                    ProductId: null,
                    Name: "Venda PDV",
                    Quantity: 1m,
                    UnitPrice: ReadXmlDecimal(icmsTotal, "vNF"),
                    TotalPrice: ReadXmlDecimal(icmsTotal, "vNF"),
                    Barcode: null,
                    Ncm: "21069090",
                    Cfop: "5102",
                    Csosn: "102",
                    CstIcms: "00",
                    IcmsRate: 0m,
                    PisCst: "09",
                    PisRate: 0m,
                    CofinsCst: "49",
                    CofinsRate: 0m)
            });
    }

    private static NfceEmission BuildNfceEmission(FiscalConfig config, JsonObject? payload, string modelo = "65")
    {
        modelo = modelo == "55" ? "55" : "65";
        var sale = GetObject(payload, "sale");
        var items = GetArray(payload, "itens") ?? GetArray(payload, "items") ?? GetArray(sale, "items") ?? new JsonArray();
        var saleId = GetString(payload, "vendaId") ?? GetString(payload, "venda_id") ?? GetString(sale, "id") ?? Guid.NewGuid().ToString("N");
        var paymentMethod = GetString(payload, "paymentMethod") ?? GetString(sale, "paymentMethod") ?? "dinheiro";
        var issueDate = ResolveFiscalIssueDate(payload);
        var serie = ParseInt(GetString(payload, "serie"), modelo == "55" ? config.Nfe.Serie ?? 1 : config.Nfce.Serie ?? 1);
        var numero = ParseInt(GetString(payload, "numero"), Math.Max(1, modelo == "55" ? config.Nfe.UltimoNumero ?? 1 : config.Nfce.UltimoNumero ?? 1));
        var codigoUf = GetUfCode(config.Uf);
        var cnpj = OnlyDigits(config.Emitente.CnpjCpf).PadLeft(14, '0');
        var cNf = BuildStableRandomCode(saleId, numero);
        var chave = BuildAccessKey(codigoUf, issueDate, cnpj, modelo, serie, numero, cNf, "1");
        var lines = BuildNfceLines(items, sale, modelo);
        var recipient = modelo == "55" ? BuildRecipientConfig(payload) : null;

        if (lines.Count == 0)
        {
            var totalCents = GetInt(payload, "totalCents") ?? GetInt(sale, "totalCents") ?? 0;
            lines.Add(new NfceLine(
                ProductId: null,
                Name: "Venda PDV",
                Quantity: 1m,
                UnitPrice: MoneyFromCents(totalCents),
                TotalPrice: MoneyFromCents(totalCents),
                Barcode: null,
                Ncm: "22030000",
                Cfop: "5102",
                Csosn: "102",
                CstIcms: "00",
                IcmsRate: 18m,
                PisCst: "04",
                PisRate: 0m,
                CofinsCst: "04",
                CofinsRate: 0m));
        }

        return new NfceEmission(
            Modelo: modelo,
            Ambiente: IsProduction(config.Ambiente) ? "producao" : "homologacao",
            CodigoUf: codigoUf,
            Uf: NormalizeUf(config.Uf),
            Serie: serie,
            Numero: numero,
            CNf: cNf,
            CDv: chave[^1].ToString(),
            Chave: chave,
            IssueDate: issueDate,
            TipoEmissao: "1",
            DhCont: null,
            XJust: null,
            PaymentMethod: paymentMethod,
            Emitter: config.Emitente,
            Recipient: recipient,
            Lines: lines);
    }

    private static List<NfceLine> BuildNfceLines(JsonArray items, JsonObject? sale, string modelo = "65")
    {
        var lines = new List<NfceLine>();

        foreach (var node in items)
        {
            var item = node as JsonObject;

            if (item is null)
            {
                continue;
            }

            var fiscal = GetObject(item, "fiscal") ?? GetObject(item, "grupo_fiscal") ?? GetObject(item, "grupoFiscal");
            var quantity = GetDecimal(item, "quantity") ?? GetDecimal(item, "quantidade") ?? 1m;
            var unitCents = GetInt(item, "priceCents") ?? GetInt(item, "preco_unitario_centavos") ?? GetInt(item, "preco_venda_centavos") ?? 0;
            var totalCents = GetInt(item, "totalPriceCents") ?? GetInt(item, "total_centavos") ?? decimal.ToInt32(Math.Round(unitCents * quantity, 0));
            var total = MoneyFromCents(totalCents);
            var unit = quantity > 0 ? Math.Round(total / quantity, 4) : MoneyFromCents(unitCents);
            var productName = GetString(item, "name") ?? GetString(item, "nome") ?? "Produto";
            var ncm = OnlyDigits(GetString(item, "ncm") ?? GetString(fiscal, "ncm"));
            var cfop = OnlyDigits(GetString(fiscal, "cfop"));
            var icmsRate = GetDecimal(fiscal, "aliquota_icms") ?? GetDecimal(fiscal, "aliquotaIcms") ?? GetDecimal(fiscal, "icmsRate") ?? 18m;
            var pisRate = GetDecimal(fiscal, "aliquota_pis") ?? GetDecimal(fiscal, "aliquotaPis") ?? GetDecimal(fiscal, "pisRate") ?? 0m;
            var cofinsRate = GetDecimal(fiscal, "aliquota_cofins") ?? GetDecimal(fiscal, "aliquotaCofins") ?? GetDecimal(fiscal, "cofinsRate") ?? 0m;

            if (ncm.Length != 8)
            {
                throw new InvalidOperationException($"Informe o NCM válido do produto \"{Limit(productName, 80)}\" antes de emitir a {GetFiscalModelLabel(modelo)}.");
            }

            lines.Add(new NfceLine(
                ProductId: GetString(item, "id") ?? GetString(item, "produto_id"),
                Name: productName,
                Quantity: quantity,
                UnitPrice: unit,
                TotalPrice: total,
                Barcode: GetString(item, "barcode") ?? GetString(item, "codigo_barras"),
                Ncm: ncm,
                Cfop: cfop.Length == 4 ? cfop : "5102",
                Csosn: OnlyDigits(GetString(fiscal, "csosn")).PadLeft(3, '0'),
                CstIcms: OnlyDigits(GetString(fiscal, "cst_icms") ?? GetString(fiscal, "cstIcms")).PadLeft(2, '0'),
                IcmsRate: Math.Max(0m, icmsRate),
                PisCst: OnlyDigits(GetString(fiscal, "cst_pis")).PadLeft(2, '0'),
                PisRate: Math.Max(0m, pisRate),
                CofinsCst: OnlyDigits(GetString(fiscal, "cst_cofins")).PadLeft(2, '0'),
                CofinsRate: Math.Max(0m, cofinsRate)));
        }

        return lines;
    }

    private static string BuildNfceXml(NfceEmission emission)
    {
        var details = new StringBuilder();
        decimal totalProducts = 0m;
        var tipoEmissao = string.IsNullOrWhiteSpace(emission.TipoEmissao) ? "1" : emission.TipoEmissao;

        for (var index = 0; index < emission.Lines.Count; index++)
        {
            var line = emission.Lines[index];
            totalProducts += line.TotalPrice;
            details.Append(BuildNfceDetailXml(line, index, emission.Ambiente, emission.Emitter.Crt));
        }

        var issueDate = emission.IssueDate.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);
        var infNFe = Wrap("infNFe",
            Wrap("ide",
                Tag("cUF", emission.CodigoUf) +
                Tag("cNF", emission.CNf) +
                Tag("natOp", "Venda") +
                Tag("mod", emission.Modelo) +
                Tag("serie", emission.Serie) +
                Tag("nNF", emission.Numero) +
                Tag("dhEmi", issueDate) +
                Tag("tpNF", "1") +
                Tag("idDest", GetDestinationIndicator(emission)) +
                Tag("cMunFG", OnlyDigits(emission.Emitter.CodigoMunicipio).PadLeft(7, '0')) +
                Tag("tpImp", emission.Modelo == "55" ? "1" : "4") +
                Tag("tpEmis", tipoEmissao) +
                Tag("cDV", emission.CDv) +
                Tag("tpAmb", emission.Ambiente == "producao" ? "1" : "2") +
                Tag("finNFe", "1") +
                Tag("indFinal", "1") +
                Tag("indPres", "1") +
                Tag("procEmi", "0") +
                Tag("verProc", "CaixaAgilPDV2") +
                OptionalTag("dhCont", emission.DhCont?.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture)) +
                OptionalTag("xJust", emission.XJust)) +
            BuildEmitterXml(emission.Emitter, emission.Uf) +
            (emission.Modelo == "55" ? BuildRecipientXml(emission) : "") +
            details +
            BuildTotalXml(totalProducts, emission.Lines, emission.Emitter.Crt) +
            Wrap("transp", Tag("modFrete", "9")) +
            BuildPaymentXml(emission.PaymentMethod, totalProducts) +
            Wrap("infAdic", Tag("infCpl", "Documento emitido pelo Caixa Agil PDV.")),
            new Dictionary<string, string>
            {
                ["versao"] = "4.00",
                ["Id"] = $"NFe{emission.Chave}"
            });

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
            Wrap("NFe", infNFe, new Dictionary<string, string> { ["xmlns"] = "http://www.portalfiscal.inf.br/nfe" });
    }

    private static string BuildEmitterXml(EmitterConfig emitter, string uf)
    {
        return Wrap("emit",
            Tag("CNPJ", OnlyDigits(emitter.CnpjCpf).PadLeft(14, '0')) +
            Tag("xNome", Limit(emitter.RazaoSocial, 60)) +
            Tag("xFant", Limit(emitter.NomeFantasia ?? emitter.RazaoSocial, 60)) +
            Wrap("enderEmit",
                Tag("xLgr", Limit(emitter.Logradouro, 60)) +
                Tag("nro", Limit(string.IsNullOrWhiteSpace(emitter.Numero) ? "S/N" : emitter.Numero, 60)) +
                OptionalTag("xCpl", Limit(emitter.Complemento, 60)) +
                Tag("xBairro", Limit(emitter.Bairro, 60)) +
                Tag("cMun", OnlyDigits(emitter.CodigoMunicipio).PadLeft(7, '0')) +
                Tag("xMun", Limit(emitter.Municipio, 60)) +
                Tag("UF", uf) +
                Tag("CEP", OnlyDigits(emitter.Cep).PadLeft(8, '0')) +
                Tag("cPais", "1058") +
                Tag("xPais", "Brasil") +
                OptionalTag("fone", OnlyDigits(emitter.Telefone))) +
            Tag("IE", OnlyDigits(emitter.InscricaoEstadual)) +
            Tag("CRT", NormalizeCrt(emitter.Crt)));
    }

    private static RecipientConfig BuildRecipientConfig(JsonObject? payload)
    {
        var sale = GetObject(payload, "sale");
        var source =
            GetObject(payload, "destinatario") ??
            GetObject(payload, "destinatarioFiscal") ??
            GetObject(payload, "clienteFiscal") ??
            GetObject(payload, "clienteConvenio") ??
            GetObject(payload, "cliente_convenio") ??
            GetObject(payload, "cliente") ??
            GetObject(sale, "destinatario") ??
            GetObject(sale, "clienteFiscal") ??
            GetObject(sale, "clienteConvenioDadosFiscais") ??
            GetObject(sale, "cliente_convenio_dados_fiscais");
        var address = GetObject(source, "endereco") ?? GetObject(source, "address") ?? source;
        var cnpj = OnlyDigits(FirstNonBlank(
            GetString(source, "cnpj_cpf"),
            GetString(source, "cnpjCpf"),
            GetString(source, "cnpj"),
            GetString(source, "documento"),
            GetString(source, "taxId")));
        var razaoSocial = FirstNonBlank(
            GetString(source, "razao_social"),
            GetString(source, "razaoSocial"),
            GetString(source, "xNome"),
            GetString(source, "nome"),
            GetString(source, "name"),
            GetString(source, "nome_fantasia"),
            GetString(source, "nomeFantasia"));
        var nomeFantasia = FirstNonBlank(
            GetString(source, "nome_fantasia"),
            GetString(source, "nomeFantasia"),
            GetString(source, "fantasia"),
            GetString(source, "alias"));
        var inscricaoEstadual = OnlyDigits(FirstNonBlank(
            GetString(source, "inscricao_estadual"),
            GetString(source, "inscricaoEstadual"),
            GetString(source, "ie")));
        var logradouro = FirstNonBlank(GetString(address, "logradouro"), GetString(address, "xLgr"), GetString(address, "rua"), GetString(address, "street"));
        var numero = FirstNonBlank(GetString(address, "numero"), GetString(address, "nro"), GetString(address, "number")) ?? "S/N";
        var complemento = FirstNonBlank(GetString(address, "complemento"), GetString(address, "xCpl"), GetString(address, "details"));
        var bairro = FirstNonBlank(GetString(address, "bairro"), GetString(address, "xBairro"), GetString(address, "district"));
        var codigoMunicipio = OnlyDigits(FirstNonBlank(
            GetString(address, "codigo_municipio"),
            GetString(address, "codigoMunicipio"),
            GetString(address, "codigo_ibge"),
            GetString(address, "codigoIbge"),
            GetString(address, "cMun"),
            GetString(address, "municipality")));
        var municipio = FirstNonBlank(GetString(address, "municipio"), GetString(address, "xMun"), GetString(address, "cidade"), GetString(address, "city"));
        var rawUf = FirstNonBlank(GetString(address, "uf"), GetString(address, "UF"));
        var uf = string.IsNullOrWhiteSpace(rawUf) ? string.Empty : NormalizeUf(rawUf);
        var cep = OnlyDigits(FirstNonBlank(GetString(address, "cep"), GetString(address, "postalCode"), GetString(address, "zip"), GetString(address, "code")));
        var telefone = OnlyDigits(FirstNonBlank(GetString(source, "telefone"), GetString(source, "fone"), GetString(address, "fone")));
        var email = FirstNonBlank(GetString(source, "email"), GetString(source, "mail"));
        var missing = new List<string>();

        if (cnpj.Length != 14)
        {
            missing.Add("CNPJ");
        }

        if (string.IsNullOrWhiteSpace(razaoSocial))
        {
            missing.Add("razao social");
        }

        if (string.IsNullOrWhiteSpace(logradouro))
        {
            missing.Add("logradouro");
        }

        if (string.IsNullOrWhiteSpace(bairro))
        {
            missing.Add("bairro");
        }

        if (codigoMunicipio.Length != 7)
        {
            missing.Add("codigo IBGE");
        }

        if (string.IsNullOrWhiteSpace(municipio))
        {
            missing.Add("municipio");
        }

        if (uf.Length != 2)
        {
            missing.Add("UF");
        }

        if (cep.Length != 8)
        {
            missing.Add("CEP");
        }

        if (missing.Count > 0)
        {
            throw new InvalidOperationException($"Complete o cadastro fiscal do cliente PJ antes de emitir a NF-e. Campos pendentes: {string.Join(", ", missing)}.");
        }

        return new RecipientConfig(
            Cnpj: cnpj,
            RazaoSocial: razaoSocial!,
            NomeFantasia: nomeFantasia,
            InscricaoEstadual: inscricaoEstadual,
            Logradouro: logradouro!,
            Numero: string.IsNullOrWhiteSpace(numero) ? "S/N" : numero,
            Complemento: complemento,
            Bairro: bairro!,
            CodigoMunicipio: codigoMunicipio,
            Municipio: municipio!,
            Uf: uf,
            Cep: cep,
            Telefone: string.IsNullOrWhiteSpace(telefone) ? null : telefone,
            Email: email);
    }

    private static string BuildRecipientXml(NfceEmission emission)
    {
        var recipient = emission.Recipient;

        if (recipient is null)
        {
            throw new InvalidOperationException("Destinatario da NF-e nao informado.");
        }

        var ie = OnlyDigits(recipient.InscricaoEstadual);
        var indIeDest = ie.Length > 0 ? "1" : "9";
        var recipientName = emission.Ambiente == "producao"
            ? recipient.RazaoSocial
            : "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

        return Wrap("dest",
            Tag("CNPJ", recipient.Cnpj.PadLeft(14, '0')) +
            Tag("xNome", Limit(recipientName, 60)) +
            Wrap("enderDest",
                Tag("xLgr", Limit(recipient.Logradouro, 60)) +
                Tag("nro", Limit(string.IsNullOrWhiteSpace(recipient.Numero) ? "S/N" : recipient.Numero, 60)) +
                OptionalTag("xCpl", Limit(recipient.Complemento, 60)) +
                Tag("xBairro", Limit(recipient.Bairro, 60)) +
                Tag("cMun", recipient.CodigoMunicipio.PadLeft(7, '0')) +
                Tag("xMun", Limit(recipient.Municipio, 60)) +
                Tag("UF", recipient.Uf) +
                Tag("CEP", recipient.Cep.PadLeft(8, '0')) +
                Tag("cPais", "1058") +
                Tag("xPais", "Brasil") +
                OptionalTag("fone", recipient.Telefone)) +
            Tag("indIEDest", indIeDest) +
            OptionalTag("IE", ie) +
            OptionalTag("email", Limit(recipient.Email, 60)));
    }

    private static string BuildNfceDetailXml(NfceLine line, int index, string ambiente, string? crt)
    {
        var productName = ambiente == "homologacao" && index == 0
            ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
            : line.Name;
        var csosn = NormalizeCsosn(line.Csosn);
        var icmsXml = IsSimpleNational(crt)
            ? Wrap("ICMS", Wrap($"ICMSSN{csosn}", Tag("orig", "0") + Tag("CSOSN", csosn)))
            : Wrap("ICMS", BuildNormalRegimeIcmsXml(line));

        return Wrap("det",
            Wrap("prod",
                Tag("cProd", (index + 1).ToString(CultureInfo.InvariantCulture)) +
                Tag("cEAN", "SEM GTIN") +
                Tag("xProd", Limit(productName, 120)) +
                Tag("NCM", line.Ncm) +
                Tag("CFOP", line.Cfop) +
                Tag("uCom", "UN") +
                Tag("qCom", FormatDecimal(line.Quantity, 4)) +
                Tag("vUnCom", FormatDecimal(line.UnitPrice, 4)) +
                Tag("vProd", FormatDecimal(line.TotalPrice, 2)) +
                Tag("cEANTrib", "SEM GTIN") +
                Tag("uTrib", "UN") +
                Tag("qTrib", FormatDecimal(line.Quantity, 4)) +
                Tag("vUnTrib", FormatDecimal(line.UnitPrice, 4)) +
                Tag("indTot", "1")) +
            Wrap("imposto",
                Tag("vTotTrib", "0.00") +
                icmsXml +
                Wrap("PIS", BuildPisXml(line)) +
                Wrap("COFINS", BuildCofinsXml(line))),
            new Dictionary<string, string> { ["nItem"] = (index + 1).ToString(CultureInfo.InvariantCulture) });
    }

    private static string BuildPisXml(NfceLine line)
    {
        var cst = NormalizeCst(line.PisCst, "04");

        if (cst is "01" or "02")
        {
            var value = Math.Round(line.TotalPrice * line.PisRate / 100m, 2);

            return Wrap("PISAliq",
                Tag("CST", cst) +
                Tag("vBC", FormatDecimal(line.TotalPrice, 2)) +
                Tag("pPIS", FormatDecimal(line.PisRate, 2)) +
                Tag("vPIS", FormatDecimal(value, 2)));
        }

        if (IsPisCofinsNtCst(cst))
        {
            return Wrap("PISNT", Tag("CST", cst));
        }

        return Wrap("PISOutr",
            Tag("CST", cst) +
            Tag("vBC", "0.00") +
            Tag("pPIS", "0.00") +
            Tag("vPIS", "0.00"));
    }

    private static string BuildCofinsXml(NfceLine line)
    {
        var cst = NormalizeCst(line.CofinsCst, "04");

        if (cst is "01" or "02")
        {
            var value = Math.Round(line.TotalPrice * line.CofinsRate / 100m, 2);

            return Wrap("COFINSAliq",
                Tag("CST", cst) +
                Tag("vBC", FormatDecimal(line.TotalPrice, 2)) +
                Tag("pCOFINS", FormatDecimal(line.CofinsRate, 2)) +
                Tag("vCOFINS", FormatDecimal(value, 2)));
        }

        if (IsPisCofinsNtCst(cst))
        {
            return Wrap("COFINSNT", Tag("CST", cst));
        }

        return Wrap("COFINSOutr",
            Tag("CST", cst) +
            Tag("vBC", "0.00") +
            Tag("pCOFINS", "0.00") +
            Tag("vCOFINS", "0.00"));
    }

    private static string BuildNormalRegimeIcmsXml(NfceLine line)
    {
        var cst = NormalizeCst(line.CstIcms, "00");

        if (cst is "40" or "41" or "50")
        {
            return Wrap("ICMS40", Tag("orig", "0") + Tag("CST", cst));
        }

        var (baseIcms, icmsValue) = CalculateIcms(line);

        return Wrap("ICMS00",
            Tag("orig", "0") +
            Tag("CST", cst) +
            Tag("modBC", "3") +
            Tag("vBC", FormatDecimal(baseIcms, 2)) +
            Tag("pICMS", FormatDecimal(line.IcmsRate, 2)) +
            Tag("vICMS", FormatDecimal(icmsValue, 2)));
    }

    private static string BuildTotalXml(decimal totalProducts, List<NfceLine> lines, string? crt)
    {
        var icmsBase = 0m;
        var icmsValue = 0m;

        if (!IsSimpleNational(crt))
        {
            foreach (var line in lines)
            {
                var cst = NormalizeCst(line.CstIcms, "00");

                if (cst is "40" or "41" or "50")
                {
                    continue;
                }

                var calculated = CalculateIcms(line);
                icmsBase += calculated.Base;
                icmsValue += calculated.Value;
            }
        }

        return Wrap("total", Wrap("ICMSTot",
            Tag("vBC", FormatDecimal(icmsBase, 2)) +
            Tag("vICMS", FormatDecimal(icmsValue, 2)) +
            Tag("vICMSDeson", "0.00") +
            Tag("vFCP", "0.00") +
            Tag("vBCST", "0.00") +
            Tag("vST", "0.00") +
            Tag("vFCPST", "0.00") +
            Tag("vFCPSTRet", "0.00") +
            Tag("vProd", FormatDecimal(totalProducts, 2)) +
            Tag("vFrete", "0.00") +
            Tag("vSeg", "0.00") +
            Tag("vDesc", "0.00") +
            Tag("vII", "0.00") +
            Tag("vIPI", "0.00") +
            Tag("vIPIDevol", "0.00") +
            Tag("vPIS", "0.00") +
            Tag("vCOFINS", "0.00") +
            Tag("vOutro", "0.00") +
            Tag("vNF", FormatDecimal(totalProducts, 2)) +
            Tag("vTotTrib", "0.00")));
    }

    private static string BuildPaymentXml(string paymentMethod, decimal total)
    {
        var method = paymentMethod.Trim().ToLowerInvariant();
        var code = method switch
        {
            "pix" => "17",
            "cartao" => "03",
            "convenio" => "05",
            _ => "01"
        };
        var card = method == "pix" || method == "cartao"
            ? Wrap("card", Tag("tpIntegra", "2") + (method == "cartao" ? Tag("tBand", "99") : ""))
            : "";

        return Wrap("pag", Wrap("detPag", Tag("tPag", code) + Tag("vPag", FormatDecimal(total, 2)) + card));
    }

    private sealed record AuthorizationExecution(
        string? SignedXml,
        string? Protocolo,
        int CStat,
        string XMotivo,
        string? ProcXml,
        int HttpStatusCode,
        string? RetornoWSString);

    private static AuthorizationExecution ExecuteAuthorization(
        NfceEmission emission,
        EnviNFe enviNFe,
        Unimake.Business.DFe.Servicos.Configuracao serviceConfig)
    {
        object authorization = emission.Modelo == "55"
            ? new NfeAutorizacao(enviNFe, serviceConfig)
            : new NfceAutorizacao(enviNFe, serviceConfig);

        return ExecuteAuthorizationService(authorization);
    }

    private static AuthorizationExecution ExecuteAuthorization(
        NfceEmission emission,
        string envioXml,
        Unimake.Business.DFe.Servicos.Configuracao serviceConfig)
    {
        object authorization = emission.Modelo == "55"
            ? new NfeAutorizacao(envioXml, serviceConfig)
            : new NfceAutorizacao(envioXml, serviceConfig);

        return ExecuteAuthorizationService(authorization);
    }

    private static AuthorizationExecution ExecuteAuthorizationService(object authorization)
    {
        try
        {
            authorization.GetType().GetMethod("Executar")?.Invoke(authorization, null);
        }
        catch (System.Reflection.TargetInvocationException error) when (error.InnerException is not null)
        {
            throw error.InnerException;
        }

        var signedXml = GetPropertyValue(authorization, "ConteudoXMLAssinado") as XmlDocument;
        var result = GetPropertyValue(authorization, "Result");
        var procResult = GetPropertyValue(authorization, "NfeProcResult");
        var protocol = GetNestedPropertyValue(result, "ProtNFe", "InfProt") ??
            GetNestedPropertyValue(procResult, "ProtNFe", "InfProt");
        var cStat = GetIntProperty(protocol, "CStat") ?? GetIntProperty(result, "CStat") ?? 0;
        var xMotivo = GetStringProperty(protocol, "XMotivo") ??
            GetStringProperty(result, "XMotivo") ??
            "Retorno fiscal sem motivo informado.";
        var protocolo = GetStringProperty(protocol, "NProt");
        var procXml = GetGeneratedXml(procResult);
        var httpStatusCode = GetIntProperty(authorization, "HttpStatusCode") ?? 0;
        var retornoWsString = GetStringProperty(authorization, "RetornoWSString");

        return new AuthorizationExecution(
            SignedXml: signedXml?.OuterXml,
            Protocolo: protocolo,
            CStat: cStat,
            XMotivo: xMotivo,
            ProcXml: procXml,
            HttpStatusCode: httpStatusCode,
            RetornoWSString: retornoWsString);
    }

    private static object? GetPropertyValue(object? target, string propertyName)
    {
        return target?.GetType().GetProperty(propertyName)?.GetValue(target);
    }

    private static object? GetNestedPropertyValue(object? target, params string[] propertyNames)
    {
        var current = target;

        foreach (var propertyName in propertyNames)
        {
            current = GetPropertyValue(current, propertyName);

            if (current is null)
            {
                return null;
            }
        }

        return current;
    }

    private static string? GetStringProperty(object? target, string propertyName)
    {
        var value = GetPropertyValue(target, propertyName);
        return value is null ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    private static int? GetIntProperty(object? target, string propertyName)
    {
        var value = GetPropertyValue(target, propertyName);

        if (value is null)
        {
            return null;
        }

        if (value is int number)
        {
            return number;
        }

        if (value is Enum)
        {
            return Convert.ToInt32(value, CultureInfo.InvariantCulture);
        }

        return int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static string? GetGeneratedXml(object? procResult)
    {
        var generated = procResult?.GetType().GetMethod("GerarXML")?.Invoke(procResult, null);

        return generated switch
        {
            XmlDocument document => document.OuterXml,
            XDocument document => document.ToString(SaveOptions.DisableFormatting),
            _ => null
        };
    }

    private static object? GetFirstEnumerableItem(object? value)
    {
        if (value is string || value is null)
        {
            return null;
        }

        if (value is System.Collections.IEnumerable enumerable)
        {
            foreach (var item in enumerable)
            {
                return item;
            }
        }

        return null;
    }

    private static void ExecuteService(object service)
    {
        try
        {
            service.GetType().GetMethod("Executar")?.Invoke(service, null);
        }
        catch (System.Reflection.TargetInvocationException error) when (error.InnerException is not null)
        {
            throw error.InnerException;
        }
    }

    private static string ResolveRequestModel(FiscalRequest request)
    {
        var payloadModel = GetString(request.Payload, "modelo");

        if (payloadModel == "55" || request.Command.Contains("nfe", StringComparison.OrdinalIgnoreCase))
        {
            return "55";
        }

        return "65";
    }

    private static string GetFiscalModelLabel(string? modelo)
    {
        return modelo == "55" ? "NF-e" : "NFC-e";
    }

    private static string GetDestinationIndicator(NfceEmission emission)
    {
        if (emission.Modelo != "55" || emission.Recipient is null)
        {
            return "1";
        }

        return string.Equals(NormalizeUf(emission.Uf), emission.Recipient.Uf, StringComparison.OrdinalIgnoreCase)
            ? "1"
            : "2";
    }

    private static string GetContingencyEmissionType(NfceEmission emission)
    {
        return emission.Modelo == "55" ? "6" : "9";
    }

    private static bool IsContingencyEmissionType(NfceEmission emission)
    {
        return emission.TipoEmissao is "4" or "5" or "6" or "7" or "8" or "9";
    }

    private static TipoEmissao ToUnimakeTipoEmissao(string? tipoEmissao)
    {
        return tipoEmissao switch
        {
            "4" => TipoEmissao.ContingenciaEPEC,
            "5" => TipoEmissao.ContingenciaFSDA,
            "6" => TipoEmissao.ContingenciaSVCAN,
            "7" => TipoEmissao.ContingenciaSVCRS,
            "8" => TipoEmissao.ContingenciaSVCSP,
            "9" => TipoEmissao.ContingenciaOffLine,
            _ => TipoEmissao.Normal
        };
    }

    private static TipoAmbiente ToUnimakeEnvironment(string? ambiente)
    {
        return IsProduction(ambiente) ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
    }

    private static string BuildFiscalEventJustification(string? value, string fallback)
    {
        var text = Regex.Replace(value ?? string.Empty, "\\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(text))
        {
            text = fallback;
        }

        text = Regex.Replace(text, @"\s*\[[^\]]+\]", "", RegexOptions.IgnoreCase).Trim();

        if (text.Length < 15)
        {
            text = $"{text} Caixa Agil".Trim();
        }

        if (text.Length < 15)
        {
            text = fallback;
        }

        return text.Length > 255 ? text[..255].TrimEnd('.', ' ', ';', ':') : text;
    }

    private static string ResolveInutilizationYear(JsonObject? payload)
    {
        var value = FirstNonBlank(
            GetString(payload, "ano"),
            GetString(payload, "year"),
            GetString(payload, "issuedAt"),
            GetString(payload, "createdAt"),
            GetString(payload, "dhEmi"));

        if (!string.IsNullOrWhiteSpace(value))
        {
            var digits = OnlyDigits(value);

            if (digits.Length == 2)
            {
                return digits;
            }

            if (digits.Length >= 4)
            {
                return digits[..4][2..];
            }

            if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
            {
                return parsed.ToString("yy", CultureInfo.InvariantCulture);
            }
        }

        return DateTimeOffset.Now.ToString("yy", CultureInfo.InvariantCulture);
    }

    private static string BuildInutilizationId(int codigoUf, string ano, string cnpjCpf, string modelo, int serie, int numeroInicial, int numeroFinal)
    {
        return string.Concat(
            "ID",
            codigoUf.ToString(CultureInfo.InvariantCulture).PadLeft(2, '0'),
            OnlyDigits(ano).PadLeft(2, '0')[^2..],
            OnlyDigits(cnpjCpf).PadLeft(14, '0'),
            modelo == "55" ? "55" : "65",
            serie.ToString(CultureInfo.InvariantCulture).PadLeft(3, '0'),
            numeroInicial.ToString(CultureInfo.InvariantCulture).PadLeft(9, '0'),
            numeroFinal.ToString(CultureInfo.InvariantCulture).PadLeft(9, '0'));
    }

    private static string BuildFiscalEventOperatorMessage(string eventName, int cStat, string? xMotivo)
    {
        var message = Regex.Replace(xMotivo ?? string.Empty, "\\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(message))
        {
            return $"{eventName} retornou codigo {cStat}.";
        }

        return message.Length > 180
            ? $"{eventName} {cStat}: {message[..180].TrimEnd('.', ' ', ';', ':')}."
            : $"{eventName} {cStat}: {message}";
    }

    private static string RemoveDiacritics(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);

            if (category != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character);
            }
        }

        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    private static bool IsInutilizationAccepted(int cStat, string? xMotivo)
    {
        var normalized = RemoveDiacritics(xMotivo ?? string.Empty).ToLowerInvariant();

        return cStat == 102 ||
            (cStat == 563 && normalized.Contains("inutilizacao")) ||
            normalized.Contains("inutilizacao homologada") ||
            normalized.Contains("ja existe pedido de inutilizacao");
    }

    private static bool IsCancellationAccepted(int cStat, string? xMotivo)
    {
        var normalized = RemoveDiacritics(xMotivo ?? string.Empty).ToLowerInvariant();

        return cStat is 101 or 135 or 155 ||
            normalized.Contains("evento registrado") ||
            normalized.Contains("cancelamento homologado") ||
            normalized.Contains("duplicidade de evento");
    }

    private static string? TryReadAuthorizationProtocol(string? xmlPath, string chave)
    {
        if (string.IsNullOrWhiteSpace(xmlPath) || !File.Exists(xmlPath))
        {
            return null;
        }

        try
        {
            var document = new XmlDocument { PreserveWhitespace = true };
            document.Load(xmlPath);
            var namespaceManager = new XmlNamespaceManager(document.NameTable);
            namespaceManager.AddNamespace("nfe", "http://www.portalfiscal.inf.br/nfe");
            var infProt = document.SelectSingleNode("//nfe:protNFe/nfe:infProt", namespaceManager) as XmlElement;

            if (infProt is null)
            {
                return null;
            }

            var protocolChave = OnlyDigits(ReadXmlChildValue(infProt, "chNFe"));

            if (!string.IsNullOrWhiteSpace(chave) && protocolChave != chave)
            {
                return null;
            }

            return FirstNonBlank(
                ReadXmlChildValue(infProt, "nProt"),
                ReadXmlChildValue(infProt, "NProt"));
        }
        catch
        {
            return null;
        }
    }

    private static string EnsureFiscalXmlSubdirectory(FiscalConfig config, string name)
    {
        var directory = Path.Combine(config.Diretorios.Xml!, name);
        Directory.CreateDirectory(directory);
        return directory;
    }

    private static (decimal Base, decimal Value) CalculateIcms(NfceLine line)
    {
        var baseIcms = Math.Round(Math.Max(0m, line.TotalPrice), 2);
        var value = Math.Round(baseIcms * Math.Max(0m, line.IcmsRate) / 100m, 2);

        return (baseIcms, value);
    }

    private static string BuildAccessKey(int codigoUf, DateTimeOffset date, string cnpj, string modelo, int serie, int numero, string cNf, string tpEmis)
    {
        var baseKey = string.Concat(
            codigoUf.ToString(CultureInfo.InvariantCulture).PadLeft(2, '0'),
            date.ToString("yyMM", CultureInfo.InvariantCulture),
            OnlyDigits(cnpj).PadLeft(14, '0'),
            modelo == "55" ? "55" : "65",
            serie.ToString(CultureInfo.InvariantCulture).PadLeft(3, '0'),
            numero.ToString(CultureInfo.InvariantCulture).PadLeft(9, '0'),
            OnlyDigits(tpEmis).PadLeft(1, '0')[^1].ToString(),
            cNf.PadLeft(8, '0'));

        return baseKey + BuildAccessKeyDigit(baseKey);
    }

    private static int BuildAccessKeyDigit(string baseKey)
    {
        var weight = 2;
        var sum = 0;

        for (var index = baseKey.Length - 1; index >= 0; index--)
        {
            sum += (baseKey[index] - '0') * weight;
            weight = weight == 9 ? 2 : weight + 1;
        }

        var mod = sum % 11;
        return mod == 0 || mod == 1 ? 0 : 11 - mod;
    }

    private static string BuildStableRandomCode(string saleId, int numero)
    {
        long hash = 0;

        foreach (var character in saleId)
        {
            hash = (hash * 31 + character) % 100000000;
        }

        var code = hash == 0 ? 1 : hash;
        var noteCode = numero % 100000000;

        if (code == noteCode)
        {
            code = (code + 1) % 100000000;
        }

        return code.ToString(CultureInfo.InvariantCulture).PadLeft(8, '0');
    }

    private static string Tag(string name, object? value)
    {
        return $"<{name}>{EscapeXml(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty)}</{name}>";
    }

    private static string OptionalTag(string name, string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? "" : Tag(name, value);
    }

    private static string Wrap(string name, string inner, Dictionary<string, string>? attributes = null)
    {
        var attr = attributes is null || attributes.Count == 0
            ? ""
            : " " + string.Join(" ", attributes.Select(item => $"{item.Key}=\"{EscapeXml(item.Value)}\""));

        return $"<{name}{attr}>{inner}</{name}>";
    }

    private static string EscapeXml(string value)
    {
        return value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");
    }

    private static string OnlyDigits(string? value)
    {
        return Regex.Replace(value ?? string.Empty, "\\D+", "");
    }

    private static string Limit(string? value, int maxLength)
    {
        var text = (value ?? string.Empty).Replace('\uFFFD', ' ');
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);

        foreach (var character in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);

            if (category == UnicodeCategory.NonSpacingMark || char.IsControl(character))
            {
                continue;
            }

            builder.Append(character);
        }

        var normalized = Regex.Replace(builder.ToString().Normalize(NormalizationForm.FormC), "\\s+", " ").Trim();

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string FormatDecimal(decimal value, int digits)
    {
        return value.ToString($"F{digits}", CultureInfo.InvariantCulture);
    }

    private static string ToHex(string value)
    {
        return Convert.ToHexString(Encoding.UTF8.GetBytes(value));
    }

    private static decimal MoneyFromCents(int cents)
    {
        return Math.Round(Math.Max(0, cents) / 100m, 2);
    }

    private static decimal? GetDecimal(JsonObject? node, string propertyName)
    {
        var value = GetString(node, propertyName);

        if (decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ||
            decimal.TryParse(value, NumberStyles.Any, CultureInfo.CurrentCulture, out parsed))
        {
            return parsed;
        }

        return null;
    }

    private static JsonArray? GetArray(JsonObject? node, string propertyName)
    {
        if (node is null || !node.TryGetPropertyValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        return value as JsonArray;
    }

    private static DateTimeOffset? ParseDateTimeOffset(string? value)
    {
        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed)
            ? parsed
            : null;
    }

    private static DateTimeOffset ResolveFiscalIssueDate(JsonObject? payload)
    {
        var now = DateTimeOffset.Now;
        var candidate =
            ParseDateTimeOffset(GetString(payload, "dhEmi")) ??
            ParseDateTimeOffset(GetString(payload, "issuedAt")) ??
            ParseDateTimeOffset(GetString(payload, "emittedAt")) ??
            ParseDateTimeOffset(GetString(payload, "emissaoEm"));

        if (candidate is null)
        {
            return now;
        }

        var localCandidate = candidate.Value.ToLocalTime();

        if (localCandidate < now.AddMinutes(-2) || localCandidate > now.AddMinutes(5))
        {
            return now;
        }

        return localCandidate;
    }

    private static bool IsProduction(string? ambiente)
    {
        return string.Equals(ambiente, "producao", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(ambiente, "producao", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeUf(string? uf)
    {
        var normalized = (uf ?? "SP").Trim().ToUpperInvariant();
        return normalized.Length == 2 ? normalized : "SP";
    }

    private static int GetUfCode(string? uf)
    {
        return NormalizeUf(uf) switch
        {
            "RO" => 11,
            "AC" => 12,
            "AM" => 13,
            "RR" => 14,
            "PA" => 15,
            "AP" => 16,
            "TO" => 17,
            "MA" => 21,
            "PI" => 22,
            "CE" => 23,
            "RN" => 24,
            "PB" => 25,
            "PE" => 26,
            "AL" => 27,
            "SE" => 28,
            "BA" => 29,
            "MG" => 31,
            "ES" => 32,
            "RJ" => 33,
            "PR" => 41,
            "SC" => 42,
            "RS" => 43,
            "MS" => 50,
            "MT" => 51,
            "GO" => 52,
            "DF" => 53,
            _ => 35
        };
    }

    private static string NormalizeCrt(string? crt)
    {
        var digits = OnlyDigits(crt);
        return digits is "1" or "2" or "3" or "4" ? digits : "3";
    }

    private static bool IsSimpleNational(string? crt)
    {
        var normalized = NormalizeCrt(crt);
        return normalized is "1" or "4";
    }

    private static string NormalizeCsosn(string? csosn)
    {
        var normalized = OnlyDigits(csosn).PadLeft(3, '0');
        return normalized is "101" or "102" or "103" or "300" or "400" ? normalized : "102";
    }

    private static string NormalizeCst(string? cst, string fallback)
    {
        var digits = OnlyDigits(cst);

        if (string.IsNullOrWhiteSpace(digits))
        {
            return fallback;
        }

        var normalized = digits.PadLeft(2, '0');
        return normalized.Length == 2 ? normalized : fallback;
    }

    private static bool IsPisCofinsNtCst(string cst)
    {
        return cst is "04" or "05" or "06" or "07" or "08" or "09";
    }

    private static int ParseInt(string? value, int fallback)
    {
        return int.TryParse(OnlyDigits(value), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : fallback;
    }

    private sealed record NfceEmission(
        string Modelo,
        string Ambiente,
        int CodigoUf,
        string Uf,
        int Serie,
        int Numero,
        string CNf,
        string CDv,
        string Chave,
        DateTimeOffset IssueDate,
        string TipoEmissao,
        DateTimeOffset? DhCont,
        string? XJust,
        string PaymentMethod,
        EmitterConfig Emitter,
        RecipientConfig? Recipient,
        List<NfceLine> Lines);

    private sealed record RecipientConfig(
        string Cnpj,
        string RazaoSocial,
        string? NomeFantasia,
        string? InscricaoEstadual,
        string Logradouro,
        string Numero,
        string? Complemento,
        string Bairro,
        string CodigoMunicipio,
        string Municipio,
        string Uf,
        string Cep,
        string? Telefone,
        string? Email);

    private sealed record NfceLine(
        string? ProductId,
        string Name,
        decimal Quantity,
        decimal UnitPrice,
        decimal TotalPrice,
        string? Barcode,
        string Ncm,
        string Cfop,
        string Csosn,
        string CstIcms,
        decimal IcmsRate,
        string PisCst,
        decimal PisRate,
        string CofinsCst,
        decimal CofinsRate);

    private sealed record DanfeNfceData(
        string EmitenteNome,
        string EmitenteFantasia,
        string Cnpj,
        string Ie,
        string Endereco,
        string Municipio,
        string Uf,
        string Serie,
        string Numero,
        string Chave,
        string DhEmi,
        string Protocolo,
        string QrCode,
        decimal Total,
        decimal Pago,
        List<DanfeNfceItem> Items);

    private sealed record DanfeNfceItem(
        string Codigo,
        string Descricao,
        decimal Quantidade,
        string Unidade,
        decimal ValorUnitario,
        decimal Total);

    private static FiscalResponse PrintDanfe(FiscalRequest request)
    {
        var config = FiscalConfig.FromJson(request.Config);
        var xmlPath = GetString(request.Payload, "xmlPath") ?? GetString(request.Payload, "caminhoXml");
        var isContingencyPrint = IsContingencyDanfePrint(xmlPath, request.Payload);
        var issues = new List<string>();
        var technical = new List<string>();

        Require(xmlPath, "XML autorizado para impressão", issues);

        if (!string.IsNullOrWhiteSpace(xmlPath) && !File.Exists(xmlPath))
        {
            issues.Add("XML autorizado não encontrado.");
            technical.Add($"Arquivo não existe: {xmlPath}");
        }

        var printerInfo = ValidateConfiguredPrinter(config.Impressao, issues, technical);
        var data = new Dictionary<string, object?>
        {
            ["xmlPath"] = xmlPath,
            ["printer"] = printerInfo,
            ["adapter"] = "Unimake.Unidanfe.NET6",
            ["contingencia"] = isContingencyPrint
        };

        if (issues.Count > 0)
        {
            return FiscalResponse.Fail(
                request.Command,
                "impressao_configuracao_incompleta",
                string.Join(" ", issues),
                string.Join(" | ", technical),
                data);
        }

        try
        {
            var selectedPrinter = ResolveConfiguredPrinterName(config.Impressao);
            var danfe = ReadNfceDanfe(xmlPath!);
            var modelo = GetString(request.Payload, "modelo") == "55" ? "55" : ReadFiscalModelFromXml(xmlPath!) ?? "65";
            var unidanfeResult = PrintWithIntegratedUniDanfe(xmlPath!, config, request.Payload, selectedPrinter);

            data["adapter"] = "Unimake.Unidanfe.NET6";
            data["unidanfe"] = unidanfeResult;
            data["modelo"] = modelo;
            data["serie"] = danfe.Serie;
            data["numero"] = danfe.Numero;
            data["chave"] = danfe.Chave;
            data["printerName"] = selectedPrinter;

            return FiscalResponse.Ok(
                request.Command,
                "danfe_impresso",
                $"DANFE {GetFiscalModelLabel(modelo)} enviado pela UniDANFE integrada.",
                null,
                data);
        }
        catch (Exception error)
        {
            data["fallbackDisabled"] = "dll-only";

            return FiscalResponse.Fail(
                request.Command,
                "erro_impressao_danfe",
                ExtractDanfeOperatorMessage(error),
                error.ToString(),
                data);
        }
    }

    private static bool IsContingencyDanfePrint(string? xmlPath, JsonObject? payload)
    {
        if (GetBool(payload, "contingencia", false))
        {
            return true;
        }

        if (GetString(payload, "tpEmis") is "4" or "5" or "6" or "7" or "8" or "9")
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(xmlPath))
        {
            return false;
        }

        var normalizedPath = xmlPath.Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar);
        var pathSegments = normalizedPath.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);

        if (pathSegments.Any(segment => string.Equals(segment, "contingencia", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (!File.Exists(xmlPath))
        {
            return false;
        }

        try
        {
            var document = XDocument.Load(xmlPath, LoadOptions.PreserveWhitespace);
            return ReadXmlValue(document, "tpEmis") is "4" or "5" or "6" or "7" or "8" or "9";
        }
        catch
        {
            return false;
        }
    }

    private static object PrintWithIntegratedUniDanfe(string xmlPath, FiscalConfig config, JsonObject? payload, string? selectedPrinter)
    {
        var modelo = GetString(payload, "modelo") == "55" ? "55" : "65";
        var configName = GetString(payload, "configName") ??
            GetString(payload, "configuracao") ??
            config.Danfe.ConfigName ??
            (modelo == "55" ? "DANFE_SIMPL" : null);
        var configurationDir = ResolveUniDanfeConfigurationDir(config, xmlPath);
        var errorPath = Path.Combine(configurationDir, "erros-unidanfe.txt");
        var pdfDir = !string.IsNullOrWhiteSpace(config.Diretorios.Pdf)
            ? config.Diretorios.Pdf!
            : Path.Combine(configurationDir, "pdf");
        var bobinaMm = Math.Clamp(config.Impressao.BobinaMm ?? 80, 58, 210);
        var printerName = string.IsNullOrWhiteSpace(selectedPrinter) ? "padrao" : selectedPrinter.Trim();
        var printJobName = BuildDanfePrintJobName(payload);
        var auxiliaryPath = WriteUniDanfeAuxiliaryXml(xmlPath, configurationDir, copies: 1);

        Directory.CreateDirectory(configurationDir);
        Directory.CreateDirectory(pdfDir);

        using var printMonitor = StartDuplicatePrintJobMonitor(printJobName, printerName, maxJobsToKeep: 1);
        var unidanfeConfig = new UnidanfeConfiguration
        {
            AcaoDLL = Unimake.Unidanfe.Enumerations.AcoesDLL.Dfe,
            Arquivo = xmlPath,
            ArquivoAuxiliar = auxiliaryPath,
            ArquivoErros = errorPath,
            Configuracao = string.IsNullOrWhiteSpace(configName) ? null : configName,
            Copias = 1,
            Impressora = printerName,
            Imprimir = true,
            LarguraBobina = bobinaMm,
            NomeImpressao = printJobName,
            PastaConfiguracao = configurationDir,
            PastaPDF = pdfDir,
            PreencherIdentificacaoEmitente = true,
            PublicidadeUnidanfe = false,
            SaidaErros = Unimake.Unidanfe.Enumerations.SaidaErros.Arquivo,
            Visualizar = false,
            WaitProcess = true
        };

        UnidanfeServices.ConfigureService(configurationDir);
        UnidanfeServices.Execute(unidanfeConfig);
        var duplicatePrintJobs = printMonitor.StopAndGetResult();

        return new
        {
            configurationDir,
            pdfDir,
            errorPath,
            auxiliaryPath,
            printerName = unidanfeConfig.Impressora,
            printJobName,
            configName = unidanfeConfig.Configuracao,
            widthMm = unidanfeConfig.LarguraBobina,
            copies = unidanfeConfig.Copias,
            duplicatePrintJobs,
            printerForcedByParameter = true,
            copiesForcedByParameter = true,
            adapter = "Unimake.Unidanfe.NET6"
        };
    }

    private static string BuildDanfePrintJobName(JsonObject? payload)
    {
        var serie = FirstNonBlank(GetString(payload, "serie"), GetString(payload, "serieFiscal")) ?? "0";
        var numero = FirstNonBlank(GetString(payload, "numero"), GetString(payload, "nNF")) ?? "0";
        var modelo = GetString(payload, "modelo") == "55" ? "NFe" : "NFCe";
        var suffix = Guid.NewGuid().ToString("N")[..8];

        return $"CaixaAgil DANFE {modelo} {serie}-{numero} {suffix}";
    }

    private static DuplicatePrintJobMonitor StartDuplicatePrintJobMonitor(string printJobName, string printerName, int maxJobsToKeep)
    {
        var monitor = new DuplicatePrintJobMonitor(printJobName, printerName, maxJobsToKeep);
        monitor.Start();
        return monitor;
    }

    private static string WriteUniDanfeAuxiliaryXml(string xmlPath, string fallbackDir, int copies)
    {
        var xmlDir = Path.GetDirectoryName(xmlPath);
        var targetDir = string.IsNullOrWhiteSpace(xmlDir) ? fallbackDir : xmlDir;
        var xmlFileName = Path.GetFileName(xmlPath);
        var auxiliaryFileName = $"aux-{(string.IsNullOrWhiteSpace(xmlFileName) ? "danfe.xml" : xmlFileName)}";
        var auxiliaryPath = Path.Combine(targetDir!, auxiliaryFileName);

        Directory.CreateDirectory(targetDir!);

        var document = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement("outrasInf",
                new XElement("copias", copies.ToString(CultureInfo.InvariantCulture))));

        document.Save(auxiliaryPath);

        return auxiliaryPath;
    }

    private static string ResolveUniDanfeConfigurationDir(FiscalConfig config, string xmlPath)
    {
        var baseDir = config.Diretorios.Logs;

        if (string.IsNullOrWhiteSpace(baseDir))
        {
            var xmlDir = Path.GetDirectoryName(xmlPath) ?? Environment.CurrentDirectory;
            baseDir = Path.Combine(xmlDir, "..", "unidanfe");
        }
        else
        {
            baseDir = Path.Combine(baseDir, "unidanfe");
        }

        return Path.GetFullPath(baseDir);
    }

    private sealed class DuplicatePrintJobMonitor : IDisposable
    {
        private readonly string printJobName;
        private readonly string printerName;
        private readonly int maxJobsToKeep;
        private readonly object syncRoot = new();
        private readonly HashSet<string> observedJobKeys = new(StringComparer.OrdinalIgnoreCase);
        private readonly List<PrintJobInfo> observedJobs = new();
        private readonly List<PrintJobInfo> keptJobs = new();
        private readonly List<PrintJobInfo> canceledJobs = new();
        private readonly List<string> errors = new();
        private CancellationTokenSource? cancellation;
        private Task? monitorTask;

        public DuplicatePrintJobMonitor(string printJobName, string printerName, int maxJobsToKeep)
        {
            this.printJobName = printJobName;
            this.printerName = printerName;
            this.maxJobsToKeep = Math.Max(1, maxJobsToKeep);
        }

        public void Start()
        {
            cancellation = new CancellationTokenSource();
            monitorTask = Task.Run(() => Monitor(cancellation.Token));
        }

        public object StopAndGetResult()
        {
            if (cancellation is null || monitorTask is null)
            {
                return BuildResult("not_started");
            }

            Thread.Sleep(1500);
            cancellation.Cancel();

            try
            {
                monitorTask.Wait(TimeSpan.FromSeconds(3));
            }
            catch (AggregateException error)
            {
                lock (syncRoot)
                {
                    errors.Add(error.Flatten().InnerException?.Message ?? error.Message);
                }
            }

            return BuildResult("completed");
        }

        public void Dispose()
        {
            cancellation?.Cancel();
            cancellation?.Dispose();
        }

        private void Monitor(CancellationToken token)
        {
            var deadline = DateTime.UtcNow.AddSeconds(20);

            while (!token.IsCancellationRequested && DateTime.UtcNow < deadline)
            {
                try
                {
                    InspectPrintQueues();
                }
                catch (Exception error)
                {
                    lock (syncRoot)
                    {
                        errors.Add(error.Message);
                    }
                }

                Thread.Sleep(80);
            }
        }

        private void InspectPrintQueues()
        {
            using var server = new LocalPrintServer();
            var queues = server.GetPrintQueues(new[]
            {
                EnumeratedPrintQueueTypes.Local,
                EnumeratedPrintQueueTypes.Connections
            });

            foreach (var queue in queues)
            {
                queue.Refresh();

                foreach (var job in queue.GetPrintJobInfoCollection())
                {
                    if (!string.Equals(job.Name, printJobName, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    var info = new PrintJobInfo(
                        QueueName: queue.Name,
                        JobId: job.JobIdentifier,
                        DocumentName: job.Name,
                        Status: job.JobStatus.ToString(),
                        SubmittedAt: job.TimeJobSubmitted);
                    var key = $"{info.QueueName}:{info.JobId}";

                    lock (syncRoot)
                    {
                        if (observedJobKeys.Add(key))
                        {
                            observedJobs.Add(info);
                        }

                        if (keptJobs.Any(item => string.Equals(item.Key, key, StringComparison.OrdinalIgnoreCase)))
                        {
                            continue;
                        }

                        if (keptJobs.Count < maxJobsToKeep)
                        {
                            keptJobs.Add(info);
                            continue;
                        }

                        if (canceledJobs.Any(item => string.Equals(item.Key, key, StringComparison.OrdinalIgnoreCase)))
                        {
                            continue;
                        }
                    }

                    try
                    {
                        job.Cancel();

                        lock (syncRoot)
                        {
                            canceledJobs.Add(info);
                        }
                    }
                    catch (Exception error)
                    {
                        lock (syncRoot)
                        {
                            errors.Add($"Falha ao cancelar job {key}: {error.Message}");
                        }
                    }
                }
            }
        }

        private object BuildResult(string status)
        {
            lock (syncRoot)
            {
                return new
                {
                    status,
                    printJobName,
                    requestedPrinter = printerName,
                    maxJobsToKeep,
                    observedCount = observedJobs.Count,
                    keptCount = keptJobs.Count,
                    canceledCount = canceledJobs.Count,
                    observedJobs = observedJobs.ToArray(),
                    keptJobs = keptJobs.ToArray(),
                    canceledJobs = canceledJobs.ToArray(),
                    errors = errors.Distinct().Take(5).ToArray()
                };
            }
        }

        private sealed record PrintJobInfo(
            string QueueName,
            int JobId,
            string DocumentName,
            string Status,
            DateTime SubmittedAt)
        {
            public string Key => $"{QueueName}:{JobId}";
        }
    }

    private static string ExtractDanfeOperatorMessage(Exception error)
    {
        var message = Regex.Replace(error.Message ?? string.Empty, "\\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(message))
        {
            return "Não foi possível imprimir o DANFE pela UniDANFE integrada.";
        }

        if (message.Length > 220)
        {
            message = message[..220].TrimEnd('.', ' ', ';', ':') + ".";
        }

        return $"Falha na UniDANFE integrada: {message}";
    }

    private static DanfeNfceData ReadNfceDanfe(string xmlPath)
    {
        var document = XDocument.Load(xmlPath, LoadOptions.PreserveWhitespace);
        var infNFe = FirstXmlElement(document, "infNFe") ?? throw new InvalidOperationException("XML autorizado sem infNFe.");
        var emit = FirstXmlElement(infNFe, "emit");
        var ender = FirstXmlElement(emit, "enderEmit");
        var ide = FirstXmlElement(infNFe, "ide");
        var total = FirstXmlElement(infNFe, "ICMSTot");
        var pagamento = FirstXmlElement(infNFe, "pag");
        var protocolo = FirstXmlElement(document, "infProt");
        var supl = FirstXmlElement(document, "infNFeSupl");
        var chave = OnlyDigits(infNFe.Attribute("Id")?.Value);

        if (chave.Length > 44)
        {
            chave = chave[^44..];
        }

        var items = infNFe
            .Elements()
            .Where(element => element.Name.LocalName == "det")
            .Select(det =>
            {
                var prod = FirstXmlElement(det, "prod");

                return new DanfeNfceItem(
                    Codigo: ReadXmlValue(prod, "cProd"),
                    Descricao: ReadXmlValue(prod, "xProd"),
                    Quantidade: ReadXmlDecimal(prod, "qCom"),
                    Unidade: ReadXmlValue(prod, "uCom"),
                    ValorUnitario: ReadXmlDecimal(prod, "vUnCom"),
                    Total: ReadXmlDecimal(prod, "vProd"));
            })
            .ToList();
        var endereco = string.Join(", ", new[]
        {
            ReadXmlValue(ender, "xLgr"),
            ReadXmlValue(ender, "nro"),
            ReadXmlValue(ender, "xBairro")
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return new DanfeNfceData(
            EmitenteNome: ReadXmlValue(emit, "xNome"),
            EmitenteFantasia: ReadXmlValue(emit, "xFant"),
            Cnpj: ReadXmlValue(emit, "CNPJ"),
            Ie: ReadXmlValue(emit, "IE"),
            Endereco: endereco,
            Municipio: ReadXmlValue(ender, "xMun"),
            Uf: ReadXmlValue(ender, "UF"),
            Serie: ReadXmlValue(ide, "serie"),
            Numero: ReadXmlValue(ide, "nNF"),
            Chave: chave,
            DhEmi: ReadXmlValue(ide, "dhEmi"),
            Protocolo: ReadXmlValue(protocolo, "nProt"),
            QrCode: ReadXmlValue(supl, "qrCode"),
            Total: ReadXmlDecimal(total, "vNF"),
            Pago: ReadXmlDecimal(pagamento, "vPag"),
            Items: items);
    }

    private static string? ReadFiscalModelFromXml(string xmlPath)
    {
        try
        {
            var document = XDocument.Load(xmlPath, LoadOptions.PreserveWhitespace);
            var modelo = ReadXmlValue(document, "mod");

            return modelo is "55" or "65" ? modelo : null;
        }
        catch
        {
            return null;
        }
    }

    private static XElement? FirstXmlElement(XContainer? container, string localName)
    {
        return container?.Descendants().FirstOrDefault(element => element.Name.LocalName == localName);
    }

    private static string ReadXmlValue(XContainer? container, string localName)
    {
        return FirstXmlElement(container, localName)?.Value.Trim() ?? string.Empty;
    }

    private static decimal ReadXmlDecimal(XContainer? container, string localName)
    {
        var value = ReadXmlValue(container, localName);

        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0m;
    }

    private static FiscalResponse GenerateDanfePdfPending(FiscalRequest request)
    {
        var config = FiscalConfig.FromJson(request.Config);
        var xmlPath = GetString(request.Payload, "xmlPath") ?? GetString(request.Payload, "caminhoXml");
        var pdfDir = config.Diretorios.Pdf;
        var issues = new List<string>();
        var technical = new List<string>();

        Require(xmlPath, "XML autorizado para gerar PDF", issues);
        RequireDirectory(pdfDir, "diretório de PDFs", issues, technical);

        if (!string.IsNullOrWhiteSpace(xmlPath) && !File.Exists(xmlPath))
        {
            issues.Add("XML autorizado não encontrado.");
            technical.Add($"Arquivo não existe: {xmlPath}");
        }

        if (issues.Count > 0)
        {
            return FiscalResponse.Fail(
                request.Command,
                "pdf_configuracao_incompleta",
                string.Join(" ", issues),
                string.Join(" | ", technical),
                new { xmlPath, pdfDir });
        }

        return FiscalResponse.Fail(
            request.Command,
            "unidanfe_pdf_adapter_pendente",
            "Geração de PDF DANFE preparada, mas depende da chamada real da Unimake.UniDANFe e da licença/configuração do cliente.",
            "Validado XML e diretório de PDF; falta conectar a API de geração de PDF da DLL.",
            new { xmlPath, pdfDir, adapter = "Unimake.Unidanfe.NET6" });
    }

    private static FiscalResponse DiagnosePrinter(FiscalRequest request)
    {
        var config = FiscalConfig.FromJson(request.Config);
        var issues = new List<string>();
        var technical = new List<string>();
        var printerInfo = ValidateConfiguredPrinter(config.Impressao, issues, technical, requireConfiguredPrinter: false);

        if (issues.Count > 0)
        {
            return FiscalResponse.Fail(
                request.Command,
                "impressora_indisponivel",
                string.Join(" ", issues),
                string.Join(" | ", technical),
                printerInfo);
        }

        return FiscalResponse.Ok(
            request.Command,
            "impressora_validada",
            "Impressora fiscal validada no Windows.",
            string.Join(" | ", technical),
            printerInfo);
    }

    private static FiscalResponse ListPrinters(FiscalRequest request)
    {
        var printers = GetInstalledPrinters();

        return FiscalResponse.Ok(
            request.Command,
            "impressoras_listadas",
            printers.Count > 0
                ? "Impressoras instaladas listadas com sucesso."
                : "Nenhuma impressora instalada foi encontrada no Windows.",
            null,
            new
            {
                printers,
                defaultPrinter = GetDefaultPrinterName()
            });
    }

    private static FiscalResponse IntegrationPending(FiscalRequest request, string status, string message)
    {
        var validation = ValidateConfiguration(request);

        if (!validation.Success)
        {
            return validation with
            {
                Command = request.Command,
                FriendlyMessage = "Revise a configuração fiscal antes de executar esta operação."
            };
        }

        return FiscalResponse.Fail(
            request.Command,
            status,
            message,
            "Base de worker criada com dependências Unimake; falta implementar a chamada específica do serviço fiscal.",
            new
            {
                adapter = "Unimake.DFe",
                command = request.Command
            });
    }

    private static void Require(string? value, string label, ICollection<string> issues)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            issues.Add($"Informe {label}.");
        }
    }

    private static void RequirePositive(int? value, string label, ICollection<string> issues)
    {
        if (!value.HasValue || value <= 0)
        {
            issues.Add($"Informe {label} maior que zero.");
        }
    }

    private static void RequireNonNegative(int? value, string label, ICollection<string> issues)
    {
        if (!value.HasValue || value < 0)
        {
            issues.Add($"Informe {label} válido.");
        }
    }

    private static void RequireDirectory(string? directory, string label, ICollection<string> issues, ICollection<string> technical)
    {
        if (string.IsNullOrWhiteSpace(directory))
        {
            issues.Add($"Informe {label}.");
            return;
        }

        try
        {
            Directory.CreateDirectory(directory);
            technical.Add($"{label}: {directory}");
        }
        catch (Exception error)
        {
            issues.Add($"Não foi possível acessar {label}.");
            technical.Add($"{label}: {error.Message}");
        }
    }

    private static object ValidateCertificate(CertificateConfig config, ICollection<string> issues, ICollection<string> technical)
    {
        if (string.IsNullOrWhiteSpace(config.PfxPath))
        {
            return new { status = "missing" };
        }

        if (!File.Exists(config.PfxPath))
        {
            issues.Add("Certificado PFX não encontrado.");
            technical.Add($"PFX não existe: {config.PfxPath}");
            return new { status = "not_found", path = config.PfxPath };
        }

        try
        {
            using var certificate = new X509Certificate2(
                config.PfxPath,
                config.PfxPassword ?? string.Empty,
                X509KeyStorageFlags.EphemeralKeySet | X509KeyStorageFlags.Exportable);

            var now = DateTimeOffset.Now;
            var notAfter = new DateTimeOffset(certificate.NotAfter);
            var expired = notAfter <= now;

            if (expired)
            {
                issues.Add("Certificado digital vencido.");
            }

            return new
            {
                status = expired ? "expired" : "valid",
                subject = certificate.Subject,
                issuer = certificate.Issuer,
                thumbprint = certificate.Thumbprint,
                notBefore = certificate.NotBefore,
                notAfter = certificate.NotAfter,
                hasPrivateKey = certificate.HasPrivateKey
            };
        }
        catch (Exception error)
        {
            issues.Add("Certificado PFX inválido ou senha incorreta.");
            technical.Add(error.Message);
            return new { status = "invalid", path = config.PfxPath };
        }
    }

    private static object ValidateConfiguredPrinter(
        PrintConfig config,
        ICollection<string> issues,
        ICollection<string> technical,
        bool requireConfiguredPrinter = true)
    {
        var printers = GetInstalledPrinters();
        var defaultPrinter = GetDefaultPrinterName();
        var requestedPrinter = string.IsNullOrWhiteSpace(config.PrinterName)
            ? null
            : config.PrinterName.Trim();
        var useDefault = config.UseDefaultPrinter || string.IsNullOrWhiteSpace(requestedPrinter);
        var selectedPrinter = useDefault ? defaultPrinter : requestedPrinter;

        if (requireConfiguredPrinter && !useDefault && string.IsNullOrWhiteSpace(requestedPrinter))
        {
            issues.Add("Informe a impressora do DANFE/NFC-e.");
        }

        if (useDefault && string.IsNullOrWhiteSpace(defaultPrinter))
        {
            issues.Add("Impressora padrão do Windows não encontrada.");
        }

        if (!string.IsNullOrWhiteSpace(selectedPrinter) &&
            !printers.Any(printer => string.Equals(printer, selectedPrinter, StringComparison.OrdinalIgnoreCase)))
        {
            issues.Add("Impressora configurada não foi encontrada no Windows.");
            technical.Add($"Impressora solicitada: {selectedPrinter}");
        }

        return new
        {
            configuredPrinter = requestedPrinter,
            selectedPrinter,
            useDefaultPrinter = useDefault,
            defaultPrinter,
            installedPrinters = printers,
            bobinaMm = config.BobinaMm
        };
    }

    private static string? ResolveConfiguredPrinterName(PrintConfig config)
    {
        var requestedPrinter = string.IsNullOrWhiteSpace(config.PrinterName)
            ? null
            : config.PrinterName.Trim();

        return config.UseDefaultPrinter || string.IsNullOrWhiteSpace(requestedPrinter)
            ? GetDefaultPrinterName()
            : requestedPrinter;
    }

    private static List<string> GetInstalledPrinters()
    {
        var printers = new List<string>();

        foreach (string printer in PrinterSettings.InstalledPrinters)
        {
            printers.Add(printer);
        }

        return printers;
    }

    private static string? GetDefaultPrinterName()
    {
        try
        {
            var settings = new PrinterSettings();
            return settings.IsDefaultPrinter ? settings.PrinterName : null;
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizeCommand(string command)
    {
        return command.Trim().ToLowerInvariant();
    }

    private static string? GetString(JsonObject? node, string propertyName)
    {
        if (node is null || !node.TryGetPropertyValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        return value.GetValueKind() switch
        {
            JsonValueKind.String => value.GetValue<string>(),
            JsonValueKind.Number => value.ToJsonString(),
            _ => null
        };
    }

    private static int? GetInt(JsonObject? node, string propertyName)
    {
        if (node is null || !node.TryGetPropertyValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        if (value.GetValueKind() == JsonValueKind.Number &&
            value is JsonValue jsonValue &&
            jsonValue.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (value.GetValueKind() == JsonValueKind.String &&
            int.TryParse(value.GetValue<string>(), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static bool? GetOptionalBool(JsonObject? node, string propertyName)
    {
        if (node is null || !node.TryGetPropertyValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        if (value.GetValueKind() == JsonValueKind.String)
        {
            var text = value.GetValue<string>()?.Trim();

            if (bool.TryParse(text, out var parsedBool))
            {
                return parsedBool;
            }

            return text?.ToLowerInvariant() switch
            {
                "1" or "sim" or "s" or "yes" or "y" => true,
                "0" or "nao" or "n" or "no" => false,
                _ => null
            };
        }

        if (value.GetValueKind() == JsonValueKind.Number &&
            value is JsonValue jsonValue &&
            jsonValue.TryGetValue<int>(out var parsedNumber))
        {
            return parsedNumber != 0;
        }

        return value.GetValueKind() switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null
        };
    }

    private static bool GetBool(JsonObject? node, string propertyName, bool fallback = false)
    {
        return GetOptionalBool(node, propertyName) ?? fallback;
    }

    private static string? FirstNonBlank(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return null;
    }

    private static int? FirstInt(params int?[] values)
    {
        foreach (var value in values)
        {
            if (value.HasValue)
            {
                return value;
            }
        }

        return null;
    }

    private static PrintConfig BuildPrintConfig(JsonObject? impressao, JsonObject? printing)
    {
        var printerName = FirstNonBlank(
            GetString(printing, "printerName"),
            GetString(printing, "impressora"),
            GetString(printing, "nomeImpressora"),
            GetString(printing, "nome_impressora"),
            GetString(impressao, "printerName"),
            GetString(impressao, "impressora"),
            GetString(impressao, "nomeImpressora"),
            GetString(impressao, "nome_impressora"));

        var useDefaultPrinter =
            GetOptionalBool(printing, "useDefaultPrinter") ??
            GetOptionalBool(printing, "usarImpressoraPadrao") ??
            GetOptionalBool(printing, "usar_impressora_padrao") ??
            GetOptionalBool(impressao, "useDefaultPrinter") ??
            GetOptionalBool(impressao, "usarImpressoraPadrao") ??
            GetOptionalBool(impressao, "usar_impressora_padrao") ??
            string.IsNullOrWhiteSpace(printerName);

        var bobinaMm = FirstInt(
            GetInt(printing, "bobinaMm"),
            GetInt(printing, "larguraBobinaMm"),
            GetInt(printing, "largura_bobina_mm"),
            GetInt(impressao, "bobinaMm"),
            GetInt(impressao, "larguraBobinaMm"),
            GetInt(impressao, "largura_bobina_mm"));

        return new PrintConfig(printerName, useDefaultPrinter, bobinaMm);
    }

    private static JsonObject? GetObject(JsonObject? node, string propertyName)
    {
        if (node is null || !node.TryGetPropertyValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        return value as JsonObject;
    }

    private static void WriteResponse(FiscalResponse response)
    {
        Console.WriteLine(JsonSerializer.Serialize(response, SerializerOptions));
    }

    private sealed record FiscalRequest(
        string Command,
        JsonObject? Config,
        JsonObject? Payload,
        string? CorrelationId);

    private sealed record FiscalConfig(
        string? Ambiente,
        string? Uf,
        string? ModeloPrioritario,
        EmitterConfig Emitente,
        CertificateConfig Certificado,
        NfceConfig Nfce,
        NfeConfig Nfe,
        PrintConfig Impressao,
        DanfeConfig Danfe,
        DirectoryConfig Diretorios)
    {
        public static FiscalConfig FromJson(JsonObject? node)
        {
            var emitente = GetObject(node, "emitente") ?? GetObject(node, "emitter");
            var certificado = GetObject(node, "certificado") ?? GetObject(node, "certificate");
            var nfce = GetObject(node, "nfce");
            var nfe = GetObject(node, "nfe");
            var impressao = GetObject(node, "impressao");
            var printing = GetObject(node, "printing");
            var danfe = GetObject(node, "danfe") ?? GetObject(node, "unidanfe") ?? GetObject(node, "uninfe");
            var diretorios = GetObject(node, "diretorios") ?? GetObject(node, "directories");
            var endereco = GetObject(emitente, "endereco") ?? GetObject(emitente, "address");

            return new FiscalConfig(
                Ambiente: GetString(node, "ambiente") ?? GetString(node, "environment"),
                Uf: GetString(node, "uf") ?? GetString(endereco, "uf"),
                ModeloPrioritario: GetString(node, "modeloPrioritario") ?? GetString(node, "priorityModel"),
                Emitente: new EmitterConfig(
                    CnpjCpf: GetString(emitente, "cnpjCpf") ?? GetString(emitente, "cnpj_cpf") ?? GetString(emitente, "cnpj"),
                    RazaoSocial: GetString(emitente, "razaoSocial") ?? GetString(emitente, "razao_social"),
                    NomeFantasia: GetString(emitente, "nomeFantasia") ?? GetString(emitente, "nome_fantasia"),
                    InscricaoEstadual: GetString(emitente, "inscricaoEstadual") ?? GetString(emitente, "inscricao_estadual") ?? GetString(emitente, "ie"),
                    Crt: GetString(emitente, "crt"),
                    Logradouro: GetString(endereco, "logradouro") ?? GetString(endereco, "xLgr") ?? GetString(endereco, "addressStreet"),
                    Numero: GetString(endereco, "numero") ?? GetString(endereco, "nro") ?? GetString(endereco, "addressNumber"),
                    Complemento: GetString(endereco, "complemento") ?? GetString(endereco, "xCpl") ?? GetString(endereco, "addressComplement"),
                    Bairro: GetString(endereco, "bairro") ?? GetString(endereco, "xBairro") ?? GetString(endereco, "neighborhood"),
                    CodigoMunicipio: GetString(endereco, "codigoMunicipio") ?? GetString(endereco, "codigo_municipio") ?? GetString(endereco, "codigoIbge") ?? GetString(endereco, "codigo_ibge") ?? GetString(endereco, "cMun") ?? GetString(endereco, "cityCodeIbge"),
                    Municipio: GetString(endereco, "municipio") ?? GetString(endereco, "xMun") ?? GetString(endereco, "cityName"),
                    Cep: GetString(endereco, "cep") ?? GetString(endereco, "postalCode"),
                    Telefone: GetString(emitente, "telefone") ?? GetString(emitente, "fone") ?? GetString(endereco, "fone")),
                Certificado: new CertificateConfig(
                    PfxPath: GetString(certificado, "pfxPath") ?? GetString(certificado, "pfx_path") ?? GetString(certificado, "caminhoPfx"),
                    PfxPassword: GetString(certificado, "pfxPassword") ?? GetString(certificado, "pfx_password") ?? GetString(certificado, "senha")),
                Nfce: new NfceConfig(
                    Serie: GetInt(nfce, "serie"),
                    UltimoNumero: GetInt(nfce, "ultimoNumero") ?? GetInt(nfce, "ultimo_numero") ?? GetInt(nfce, "proximoNumero") ?? GetInt(nfce, "proximo_numero"),
                    CscId: GetString(nfce, "cscId") ?? GetString(nfce, "csc_id"),
                    CscToken: GetString(nfce, "cscToken") ?? GetString(nfce, "csc_token")),
                Nfe: new NfeConfig(
                    Serie: GetInt(nfe, "serie"),
                    UltimoNumero: GetInt(nfe, "ultimoNumero") ?? GetInt(nfe, "ultimo_numero") ?? GetInt(nfe, "proximoNumero") ?? GetInt(nfe, "proximo_numero")),
                Impressao: BuildPrintConfig(impressao, printing),
                Danfe: new DanfeConfig(
                    ConfigName: GetString(danfe, "configName") ?? GetString(danfe, "configuracao")),
                Diretorios: new DirectoryConfig(
                    Xml: GetString(diretorios, "xml") ?? GetString(diretorios, "xmlDir"),
                    Logs: GetString(diretorios, "logs") ?? GetString(diretorios, "logsDir"),
                    Pdf: GetString(diretorios, "pdf") ?? GetString(diretorios, "pdfDir")));
        }
    }

    private sealed record EmitterConfig(
        string? CnpjCpf,
        string? RazaoSocial,
        string? NomeFantasia,
        string? InscricaoEstadual,
        string? Crt,
        string? Logradouro,
        string? Numero,
        string? Complemento,
        string? Bairro,
        string? CodigoMunicipio,
        string? Municipio,
        string? Cep,
        string? Telefone);

    private sealed record CertificateConfig(string? PfxPath, string? PfxPassword);

    private sealed record NfceConfig(int? Serie, int? UltimoNumero, string? CscId, string? CscToken);

    private sealed record NfeConfig(int? Serie, int? UltimoNumero);

    private sealed record PrintConfig(string? PrinterName, bool UseDefaultPrinter, int? BobinaMm);

    private sealed record DanfeConfig(string? ConfigName);

    private sealed record DirectoryConfig(string? Xml, string? Logs, string? Pdf);

    private sealed record FiscalResponse(
        bool Success,
        string Command,
        string Status,
        string? CodigoRetornoSefaz,
        string? MensagemSefaz,
        string FriendlyMessage,
        string? TechnicalMessage,
        object? Data)
    {
        public static FiscalResponse Ok(string command, string status, string friendlyMessage, string? technicalMessage = null, object? data = null)
        {
            return new FiscalResponse(true, command, status, null, null, friendlyMessage, technicalMessage, data);
        }

        public static FiscalResponse Fail(string command, string status, string friendlyMessage, string? technicalMessage = null, object? data = null)
        {
            return new FiscalResponse(false, command, status, null, null, friendlyMessage, technicalMessage, data);
        }
    }
}
