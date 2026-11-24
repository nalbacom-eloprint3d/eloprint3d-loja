export async function handler() {
  const t = process.env.MP_ACCESS_TOKEN;
  const info = {
    existe_MP_ACCESS_TOKEN: typeof t === "string",
    tamanho_do_token: t ? t.length : 0,
    tipo_do_token: t
      ? t.startsWith("TEST-") ? "TEST-"
      : t.startsWith("APP_USR-") ? "APP_USR-"
      : "outro formato"
      : null,
    tem_espaco_nas_pontas: t ? t !== t.trim() : null,
    MP_ENV: process.env.MP_ENV ?? null,
    variaveis_com_MP_no_nome: Object.keys(process.env).filter(
      (k) => k.toUpperCase().includes("MP_") || k.toUpperCase().includes("MERCADO")
    ),
    contexto_de_deploy: process.env.CONTEXT ?? null,
    url_do_site: process.env.URL ?? null,
    versao_node: process.version,
  };
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(info, null, 2),
  };
}
