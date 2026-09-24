"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { applyImportAction, previewImportAction } from "../actions";
import { Alert, Badge, Button, Checkbox } from "@/components/ui";

type Row = Record<string, unknown>;
type Preview = Extract<Awaited<ReturnType<typeof previewImportAction>>, { ok: true }>;
type Result = Extract<Awaited<ReturnType<typeof applyImportAction>>, { ok: true }>;

async function readFile(file: File): Promise<Row[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const data = await readSheet(file);
    const [header, ...body] = data;
    if (!header) return [];
    const cols = header.map((h) => String(h ?? "").trim());
    return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ""])));
  }
  const text = await file.text();
  const parsed = Papa.parse<Row>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  return parsed.data;
}

export function Importer() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [publishAll, setPublishAll] = useState(false);
  const [createCategories, setCreateCategories] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    setPreview(null);
    setResult(null);
    setError(null);
    if (!file) return;
    try {
      const data = await readFile(file);
      if (!data.length) throw new Error("El archivo no tiene filas");
      setRows(data);
      setFileName(file.name);
      runPreview(data, publishAll);
    } catch (e) {
      setRows(null);
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  }

  function runPreview(data: Row[], publish: boolean) {
    startTransition(async () => {
      const res = await previewImportAction(data, { publishAll: publish });
      if (res.ok) setPreview(res);
      else setError(res.error);
    });
  }

  function apply() {
    if (!rows || !preview) return;
    const total = preview.summary.productsNew + preview.summary.productsUpdated;
    if (!confirm(`Se van a crear/actualizar ${total} producto(s). ¿Continuar?`)) return;
    startTransition(async () => {
      const res = await applyImportAction(rows, { publishAll, createCategories });
      if (res.ok) {
        setResult(res);
        setPreview(null);
      } else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="cursor-pointer border border-black px-4 py-2 text-sm font-semibold uppercase">
          Elegir archivo (.xlsx o .csv)
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {fileName && <span className="text-sm">{fileName} · {rows?.length ?? 0} filas</span>}
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox
          label="Publicar todos los productos importados"
          checked={publishAll}
          onChange={(e) => {
            setPublishAll(e.target.checked);
            if (rows) runPreview(rows, e.target.checked);
          }}
        />
        <Checkbox label="Crear categorías que no existan" checked={createCategories} onChange={(e) => setCreateCategories(e.target.checked)} />
      </div>

      {pending && <p className="text-sm text-neutral-500">Procesando…</p>}
      {error && <Alert tone="error">{error}</Alert>}

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label="Productos nuevos" value={preview.summary.productsNew} />
            <Summary label="Productos a actualizar" value={preview.summary.productsUpdated} />
            <Summary label="Variantes nuevas" value={preview.summary.variantsNew} />
            <Summary label="Variantes a actualizar" value={preview.summary.variantsUpdated} />
          </div>
          {preview.errorCount > 0 && (
            <Alert tone="warning">
              <p className="mb-2 font-semibold">{preview.errorCount} error(es): esos productos se van a omitir.</p>
              <ul className="max-h-60 space-y-1 overflow-auto text-xs">
                {preview.errors.map((e, i) => (
                  <li key={i}>Fila {e.row}{e.handle ? ` (${e.handle})` : ""}: {e.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {preview.products.length > 0 && (
            <div className="max-h-80 overflow-auto border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-100 text-left text-xs uppercase">
                  <tr><th className="p-2">Handle</th><th className="p-2">Acción</th><th className="p-2">Nombre</th><th className="p-2">Estado</th><th className="p-2">Variantes</th></tr>
                </thead>
                <tbody>
                  {preview.products.map((p) => (
                    <tr key={p.handle} className="border-t border-neutral-100">
                      <td className="p-2 font-mono text-xs">{p.handle}</td>
                      <td className="p-2">{p.isNew ? <Badge tone="green">Crear</Badge> : <Badge tone="blue">Actualizar</Badge>}</td>
                      <td className="p-2">{p.name ?? "—"}</td>
                      <td className="p-2">{p.status ?? (p.isNew ? "borrador" : "sin cambio")}</td>
                      <td className="p-2 text-xs">{p.variantsNew} nuevas · {p.variantsUpdated} actualizadas</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button type="button" onClick={apply} disabled={pending || preview.summary.productsNew + preview.summary.productsUpdated === 0}>
            Aplicar importación
          </Button>
        </div>
      )}

      {result && (
        <Alert tone={result.failures.length ? "warning" : "success"}>
          <p className="font-semibold">Importación terminada: {result.applied} producto(s) procesados.</p>
          {result.skipped > 0 && <p>{result.skipped} fila(s) con errores fueron omitidas.</p>}
          {result.failures.map((f) => <p key={f.handle} className="text-xs">{f.handle}: {f.message}</p>)}
          <Link href="/admin/productos" className="mt-2 inline-block underline">Ver productos</Link>
        </Alert>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-neutral-200 p-3">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
