import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/format";

export async function StoreFooter() {
  const s = await getSettings();
  const wa = s.notify_whatsapp ? whatsappLink(s.whatsapp, `Hola ${s.store_name}! Tengo una consulta.`) : null;
  return (
    <>
      <footer className="mt-16 border-t border-neutral-200 bg-black text-neutral-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
          <div>
            <p className="text-lg font-black uppercase tracking-widest text-white">{s.store_name}</p>
            {s.address && <p className="mt-2">{s.address}</p>}
          </div>
          <div className="space-y-1">
            <p className="font-bold uppercase text-white">Contacto</p>
            {s.contact_email && <p><a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></p>}
            {s.contact_phone && <p>{s.contact_phone}</p>}
            {s.instagram && (
              <p>
                <a href={`https://instagram.com/${s.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                  Instagram @{s.instagram.replace(/^@/, "")}
                </a>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="font-bold uppercase text-white">Tienda</p>
            <p><Link href="/productos">Productos</Link></p>
            <p><Link href="/cuenta/pedidos">Mis pedidos</Link></p>
          </div>
        </div>
        <p className="border-t border-neutral-800 py-4 text-center text-xs">© {new Date().getFullYear()} {s.store_name}</p>
      </footer>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-4 right-4 z-40 rounded-full bg-green-500 px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-600"
        >
          WhatsApp
        </a>
      )}
    </>
  );
}
