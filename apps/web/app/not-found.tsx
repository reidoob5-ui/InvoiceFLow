import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-[70vh] place-content-center px-6 text-center">
    <p className="text-sm font-semibold text-indigo-300">Erro 404</p>
    <h1 className="mt-2 text-3xl font-semibold text-white">Página não encontrada</h1>
    <p className="mt-3 text-sm text-slate-400">O endereço não existe ou foi movido.</p>
    <Link href="/" className="mx-auto mt-6 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">Voltar ao início</Link>
  </main>;
}
