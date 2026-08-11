using System.Globalization;
using System.Xml.Linq;
using CaixaAgil.FiscalWorker;

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}

var details = new List<FiscalPaymentDetail>
{
    new("pix", 100_000),
    new("credito_loja", 50_001)
};
var xml = FiscalPaymentXml.Build(details, 150_001);
var document = XDocument.Parse($"<infNFe>{xml}</infNFe>");
var paymentNodes = document.Descendants("detPag").ToList();

Assert(paymentNodes.Count == 2, "O XML deve conter entrada e saldo em detPag separados.");
Assert(paymentNodes[0].Element("indPag")?.Value == "0", "A entrada deve ser marcada como pagamento à vista.");
Assert(paymentNodes[0].Element("tPag")?.Value == "17", "A entrada Pix deve usar tPag 17.");
Assert(paymentNodes[0].Element("vPag")?.Value == "1000.00", "A entrada Pix deve preservar os centavos.");
Assert(paymentNodes[1].Element("indPag")?.Value == "1", "O saldo parcelado deve ser marcado como a prazo.");
Assert(paymentNodes[1].Element("tPag")?.Value == "05", "O saldo parcelado deve usar Crédito Loja (tPag 05).");
Assert(paymentNodes[1].Element("vPag")?.Value == "500.01", "O saldo parcelado deve preservar os centavos.");
Assert(FiscalPaymentXml.ReadTotal(document.Root) == 1_500.01m, "A reimpressão deve somar todos os vPag.");

var parsed = FiscalPaymentXml.Parse(document.Root!, 150_001);
Assert(parsed.SequenceEqual(details), "A contingência deve recuperar entrada e crédito da loja do XML.");

var creditOnlyXml = FiscalPaymentXml.Build(
    new List<FiscalPaymentDetail> { new("credito_loja", 150_000) },
    150_000);
var creditOnlyDocument = XDocument.Parse($"<infNFe>{creditOnlyXml}</infNFe>");

Assert(creditOnlyDocument.Descendants("detPag").Count() == 1, "Venda sem entrada deve ter um único detPag.");
Assert(creditOnlyDocument.Descendants("tPag").Single().Value == "05", "Venda sem entrada não pode cair em dinheiro.");

try
{
    FiscalPaymentXml.Build(details, 150_000);
    throw new InvalidOperationException("Uma soma divergente deveria ter sido rejeitada.");
}
catch (InvalidOperationException error) when (error.Message.Contains("diverge", StringComparison.OrdinalIgnoreCase))
{
}

Console.WriteLine(string.Create(
    CultureInfo.InvariantCulture,
    $"Pagamentos fiscais validados: {paymentNodes.Count} detalhes, total {FiscalPaymentXml.ReadTotal(document.Root):0.00}."));
