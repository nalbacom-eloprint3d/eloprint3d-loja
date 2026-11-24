import { randomUUID } from "node:crypto";
import products from "../../products.json" with { type: "json" };

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Origin": "*" }, body: "" };
  }
  if (event.httpMethod !== "POST") return reply(405, { error: "Método não permitido." });

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return reply(500, { error: "O Mercado Pago ainda não foi configurado na Netlify." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return reply(400, { error: "Dados do carrinho inválidos." }); }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
    return reply(400, { error: "Carrinho inválido." });
  }

  const orderItems = [];
  let total = 0;

  for (const entry of body.items) {
    const product = products.find(p => p.id === Number(entry.id));
    const quantity = Number(entry.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return reply(400, { error: "Produto ou quantidade inválida." });
    }

    let unitPrice = product.p;
    let variantTitle = "";

    if (Array.isArray(product.v)) {
      const vi = Number(entry.variantIndex);
      if (!Number.isInteger(vi) || vi < 0 || vi >= product.v.length) {
        return reply(400, { error: `Escolha uma opção válida para ${product.n}.` });
      }
      unitPrice = product.v[vi][1];
      variantTitle = ` (${product.v[vi][0]})`;
    }

    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return reply(400, { error: `${product.n} é vendido sob consulta. Finalize esse pedido pelo WhatsApp.` });
    }

    const title = `${product.n}${variantTitle}`.slice(0, 256);
    const descriptionParts = [product.d];
    if (typeof entry.color === "string" && entry.color.trim()) descriptionParts.push(`Cor: ${entry.color.trim().slice(0, 60)}`);
    if (typeof entry.personalization === "string" && entry.personalization.trim()) descriptionParts.push(`Personalização: ${entry.personalization.trim().slice(0, 120)}`);

    orderItems.push({
      id: String(product.id),
      title,
      description: descriptionParts.join(" | ").slice(0, 500),
      quantity,
      currency_id: "BRL",
      unit_price: Number(unitPrice.toFixed(2)),
    });
    total += unitPrice * quantity;
  }

  const origin = event.headers.origin || event.headers.Origin;
  // Netlify serves the function from the same site; use the configured public URL to avoid trusting arbitrary return URLs.
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || origin;
  if (!siteUrl || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(siteUrl)) {
    return reply(500, { error: "A URL pública do site ainda não está configurada." });
  }

  const payload = {
    items: orderItems,
    external_reference: `elo_${randomUUID()}`,
    back_urls: {
      success: `${siteUrl}/?pagamento=sucesso`,
      pending: `${siteUrl}/?pagamento=pendente`,
      failure: `${siteUrl}/?pagamento=falha`,
    },
    auto_return: "approved",
    statement_descriptor: "ELOPRINT3D",
  };

  try {
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("Mercado Pago preference error:", mpResponse.status, result);
      return reply(502, { error: "O Mercado Pago não conseguiu criar o checkout. Confira as credenciais e tente novamente." });
    }

    const checkoutUrl = process.env.MP_ENV === "test"
      ? (result.sandbox_init_point || result.init_point)
      : result.init_point;

    if (!checkoutUrl) return reply(502, { error: "O Mercado Pago não retornou o link de pagamento." });
    return reply(200, { checkoutUrl, preferenceId: result.id, total: Number(total.toFixed(2)) });
  } catch (error) {
    console.error("Checkout error:", error);
    return reply(502, { error: "Falha de comunicação com o Mercado Pago. Tente novamente." });
  }
}
