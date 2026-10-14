import type { MetadataRoute } from "next";
import { CALCULADORAS } from "./calculadoras/estrutura";

const BASE = "https://arqevoncode.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  const paginas = ["", "/finance", "/calculadoras", ...CALCULADORAS.map(c => `/calculadoras/${c.slug}`), "/seguranca", "/termos", "/privacidade"];
  return paginas.map(p => ({ url: `${BASE}${p}`, changeFrequency: "monthly", priority: p === "" || p === "/finance" ? 1 : 0.7 }));
}
