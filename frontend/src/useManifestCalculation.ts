import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api, ApiError } from "./api";

type Preview = {
  frete_veiculo: number;
  despesas_empresa: number;
  totalFretes: number;
  totalReceive: number;
  discounts: number;
  freightVehicle: number;
  initPercent: number;
  finalPercent: number;
  freightsCalculated: { freight777: number; freight888: number; freight999: number;
    notDelivery777: number; notDelivery888: number; notDelivery999: number };
  vehicle: { type: string; max_m3: number; max_weight: number };
};
const fields = ["cod_777_00", "cod_888_00", "cod_999_00", "nao_777", "nao_888", "nao_999",
  "outros", "diaria", "tde", "escada", "paletizacao", "estadia", "descarga"];

export function useManifestCalculation(form: RefObject<HTMLFormElement | null>, token: string,
  expired: () => void, initialId?: number) {
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState({ retentions: 0, net: 0, m3: 0, kg: 0 });
  const manual = useRef(initialId != null);
  const version = useRef(0);
  function changed(e: FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLInputElement;
    if (target.name === "frete_veiculo") manual.current = true;
    if (target.name === "placa") {
      manual.current = initialId != null;
      const input = form.current?.elements.namedItem("frete_veiculo") as HTMLInputElement | null;
      if (input && initialId == null) input.value = "";
    }
    version.current++;
    setPreview(null);
    setRevision((r) => r + 1);
  }
  useEffect(() => {
    if (!form.current) return;
    const data = new FormData(form.current);
    const n = (key: string) => Number(data.get(key) || 0);
    const retentions = n("sest_senat") + n("irrf") + n("prev_social") + n("inss");
    setValues({ retentions, net: n("ctrb_total") - n("ctrb_adiantamento") - retentions,
      m3: n("m3"), kg: n("kg") });
    setError("");
    if (!data.get("placa")) { setPending(false); return; }
    const payload: Record<string, unknown> = { placa: data.get("placa"), origem: data.get("origem") || "SP" };
    if (initialId != null) payload.manifesto_id = initialId;
    if (manual.current && data.get("frete_veiculo") !== "") payload.frete_veiculo = n("frete_veiculo");
    for (const key of fields) payload[key] = n(key);
    let active = true;
    const requestVersion = version.current;
    setPending(true);
    const timer = setTimeout(() => {
      api<Preview>("/manifests/preview", token, { method: "POST", body: JSON.stringify(payload) })
        .then((result) => {
          if (!active || requestVersion !== version.current) return;
          setPreview(result);
          if (!manual.current) {
            const input = form.current?.elements.namedItem("frete_veiculo") as HTMLInputElement | null;
            if (input && input.value === "") input.value = String(result.frete_veiculo);
          }
        })
        .catch((e) => {
          if (!active || requestVersion !== version.current) return;
          if (e instanceof ApiError && e.status === 401) expired();
          else setError((e as Error).message);
        })
        .finally(() => { if (active && requestVersion === version.current) setPending(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [revision, token, initialId]);
  return { preview, error, pending, values, changed };
}
