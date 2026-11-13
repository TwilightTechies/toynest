import { redirect } from "next/navigation";

// /admin → the product list (the proxy has already sent signed-out visitors to the login page).
export default function AdminHome() {
  redirect("/admin/products");
}
