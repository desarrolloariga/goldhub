import { redirect } from "next/navigation";

/** El middleware decide: con sesión abre el panel, sin ella manda a /login. */
export default function Raiz() {
  redirect("/panel");
}
