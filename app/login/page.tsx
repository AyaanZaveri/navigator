import { redirect } from "next/navigation";

export default function Login() {
  redirect("/?signIn=1");
}
