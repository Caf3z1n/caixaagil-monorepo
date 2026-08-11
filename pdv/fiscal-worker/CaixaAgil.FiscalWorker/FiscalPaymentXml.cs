using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace CaixaAgil.FiscalWorker;

internal sealed record FiscalPaymentDetail(
    string PaymentMethod,
    int AmountCents);

internal static class FiscalPaymentXml
{
    internal static string NormalizePaymentMethod(string? paymentMethod, bool allowLegacyFallback)
    {
        var method = Regex.Replace(paymentMethod ?? string.Empty, "[_\\s-]+", "_")
            .Trim('_')
            .ToLowerInvariant();

        return method switch
        {
            "dinheiro" => "dinheiro",
            "pix" => "pix",
            "cartao" => "cartao",
            "credito_loja" or "convenio" or "parcelamento" => "credito_loja",
            _ when allowLegacyFallback => "dinheiro",
            _ => throw new InvalidOperationException("A forma de pagamento informada não é aceita no documento fiscal.")
        };
    }

    internal static string Build(IReadOnlyList<FiscalPaymentDetail> paymentDetails, int invoiceTotalCents)
    {
        if (paymentDetails.Count is < 1 or > 100)
        {
            throw new InvalidOperationException("O documento fiscal deve conter entre 1 e 100 detalhes de pagamento.");
        }

        long totalPaymentCents = 0;
        var details = new List<XElement>();

        foreach (var payment in paymentDetails)
        {
            if (payment.AmountCents <= 0)
            {
                throw new InvalidOperationException("O valor de cada pagamento fiscal deve ser maior que zero.");
            }

            totalPaymentCents = checked(totalPaymentCents + payment.AmountCents);
            details.Add(BuildDetail(payment));
        }

        if (totalPaymentCents != invoiceTotalCents)
        {
            throw new InvalidOperationException("A soma dos pagamentos fiscais diverge do total da nota.");
        }

        return new XElement("pag", details).ToString(SaveOptions.DisableFormatting);
    }

    internal static List<FiscalPaymentDetail> Parse(XContainer infNFe, int invoiceTotalCents)
    {
        var pagamento = FirstElement(infNFe, "pag");
        var details = pagamento?
            .Elements()
            .Where(element => element.Name.LocalName == "detPag")
            .Select(detail =>
            {
                var amountCents = MoneyToCents(ReadDecimal(detail, "vPag"));
                var paymentMethod = ReadValue(detail, "tPag") switch
                {
                    "17" => "pix",
                    "03" or "04" => "cartao",
                    "05" => "credito_loja",
                    _ => "dinheiro"
                };

                return new FiscalPaymentDetail(paymentMethod, amountCents);
            })
            .Where(detail => detail.AmountCents > 0)
            .ToList() ?? new List<FiscalPaymentDetail>();

        if (details.Count == 0 && invoiceTotalCents > 0)
        {
            details.Add(new FiscalPaymentDetail("dinheiro", invoiceTotalCents));
        }

        return details;
    }

    internal static decimal ReadTotal(XContainer? pagamento)
    {
        var paymentContainer = pagamento is XElement element && element.Name.LocalName == "pag"
            ? element
            : FirstElement(pagamento, "pag");
        var details = paymentContainer?
            .Elements()
            .Where(element => element.Name.LocalName == "detPag")
            .ToList() ?? new List<XElement>();

        if (details.Count == 0)
        {
            return ReadDecimal(paymentContainer, "vPag");
        }

        return details.Sum(detail => ReadDecimal(detail, "vPag"));
    }

    private static XElement BuildDetail(FiscalPaymentDetail payment)
    {
        var method = NormalizePaymentMethod(payment.PaymentMethod, allowLegacyFallback: false);
        var code = method switch
        {
            "pix" => "17",
            "cartao" => "03",
            "credito_loja" => "05",
            _ => "01"
        };
        var detail = new XElement("detPag",
            new XElement("indPag", method == "credito_loja" ? "1" : "0"),
            new XElement("tPag", code),
            new XElement("vPag", (payment.AmountCents / 100m).ToString("0.00", CultureInfo.InvariantCulture)));

        if (method is "pix" or "cartao")
        {
            var card = new XElement("card", new XElement("tpIntegra", "2"));

            if (method == "cartao")
            {
                card.Add(new XElement("tBand", "99"));
            }

            detail.Add(card);
        }

        return detail;
    }

    private static XElement? FirstElement(XContainer? container, string localName)
    {
        return container?.Descendants().FirstOrDefault(element => element.Name.LocalName == localName);
    }

    private static string? ReadValue(XContainer? container, string localName)
    {
        return FirstElement(container, localName)?.Value;
    }

    private static decimal ReadDecimal(XContainer? container, string localName)
    {
        var value = ReadValue(container, localName);

        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0m;
    }

    private static int MoneyToCents(decimal value)
    {
        var cents = Math.Round(value * 100m, 0, MidpointRounding.AwayFromZero);

        if (cents < 0 || cents > int.MaxValue)
        {
            throw new InvalidOperationException("Valor monetário fiscal fora do limite de centavos inteiros.");
        }

        return decimal.ToInt32(cents);
    }
}
