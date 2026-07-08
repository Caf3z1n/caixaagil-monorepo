import { prefetchApiGet } from "@/lib/api-client";

type PlatformPrefetchRoute = {
  href: string;
  mainOnly?: boolean;
  permission?: string;
};

const platformRouteConfigs: PlatformPrefetchRoute[] = [
  { href: "/meu-sistema" },
  { href: "/meu-sistema/configuracoes", permission: "configuracoes" },
  { href: "/meu-sistema/grupos-fiscais", permission: "grupos_fiscais" },
  { href: "/meu-sistema/produtos", permission: "produtos" },
  { href: "/meu-sistema/estoque", permission: "estoque" },
  { href: "/meu-sistema/conferencia-caixa", permission: "conferencia_caixa" },
  { href: "/meu-sistema/convenios", permission: "convenios" },
  { href: "/meu-sistema/despesas", permission: "despesas" },
  { href: "/meu-sistema/documentos-fiscais", permission: "documentos_fiscais" },
  { href: "/meu-sistema/funcionarios", permission: "funcionarios" },
  { href: "/conta", mainOnly: true }
];

const platformRouteDataPaths = [
  { prefix: "/conta", paths: ["/conta", "/pdvs", "/subcontas"] },
  { prefix: "/meu-sistema/configuracoes", paths: ["/configuracoes"] },
  { prefix: "/meu-sistema/grupos-fiscais", paths: ["/grupos-fiscais"] },
  { prefix: "/grupos-fiscais", paths: ["/grupos-fiscais"] },
  { prefix: "/meu-sistema/produtos", paths: ["/produtos"] },
  { prefix: "/produtos", paths: ["/produtos"] },
  { prefix: "/meu-sistema/estoque", paths: ["/estoques"] },
  { prefix: "/estoque", paths: ["/estoques"] },
  { prefix: "/meu-sistema/conferencia-caixa", paths: ["/caixa/conferencia", "/configuracoes"] },
  { prefix: "/conferencia-caixa", paths: ["/caixa/conferencia", "/configuracoes"] },
  { prefix: "/meu-sistema/convenios", paths: ["/convenios/clientes", "/convenios/recebimentos"] },
  { prefix: "/meu-sistema/despesas", paths: ["/despesas"] },
  { prefix: "/meu-sistema/documentos-fiscais", paths: ["/nf?limit=10&offset=0"] },
  { prefix: "/documentos-fiscais", paths: ["/nf?limit=10&offset=0"] },
  { prefix: "/meu-sistema/funcionarios", paths: ["/funcionarios"] },
  { prefix: "/meu-sistema", paths: ["/configuracoes"] }
];

function normalizePath(path: string) {
  try {
    return new URL(path, "https://caixaagil.local").pathname;
  } catch {
    return path.split("?")[0]?.split("#")[0] ?? path;
  }
}

function canUsePlatformRoute(
  route: PlatformPrefetchRoute,
  accountType: string,
  accountPermissions: string[]
) {
  if (accountType !== "subconta") {
    return true;
  }

  if (route.mainOnly) {
    return false;
  }

  if (!route.permission) {
    return true;
  }

  return accountPermissions.includes("*") || accountPermissions.includes(route.permission);
}

export function getPlatformPrefetchRoutes(accountType = "usuario", accountPermissions: string[] = ["*"]) {
  return platformRouteConfigs
    .filter((route) => canUsePlatformRoute(route, accountType, accountPermissions))
    .map((route) => route.href);
}

export function getPlatformDataPaths(path: string) {
  const pathname = normalizePath(path);
  const routeData = platformRouteDataPaths.find((route) => pathname.startsWith(route.prefix));

  return routeData?.paths ?? [];
}

export function prefetchPlatformDataForPath(path: string, token: string | null, cacheTtlMs = 60_000) {
  if (!token) {
    return [];
  }

  return getPlatformDataPaths(path).map((apiPath) =>
    prefetchApiGet<unknown>(apiPath, {
      cacheTtlMs,
      token
    })
  );
}
