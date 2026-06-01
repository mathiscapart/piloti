"use client";

import { Nfc, ScanLine, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearEquipmentNfc, setEquipmentNfc } from "@/modules/inventory/actions";

// Web NFC (NDEFReader) n'est pas dans les types DOM standards — déclaration
// minimale pour rester en TS strict sans `any`.
interface NDEFReadingEvent {
  serialNumber: string;
}
interface NDEFReaderLike {
  scan: () => Promise<void>;
  write: (message: { records: { recordType: string; data: string }[] }) => Promise<void>;
  addEventListener: (type: "reading", cb: (e: NDEFReadingEvent) => void) => void;
}
type NDEFReaderCtor = new () => NDEFReaderLike;

export function NfcSection({
  equipmentId,
  nfcUid,
  resolverBaseUrl,
}: {
  equipmentId: string;
  nfcUid: string | null;
  resolverBaseUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");

  function associate(uid: string) {
    startTransition(async () => {
      const result = await setEquipmentNfc(equipmentId, uid);
      if (result.error) toast.error(result.error);
      else toast.success("Tag NFC associé.");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await clearEquipmentNfc(equipmentId);
      if (result.error) toast.error(result.error);
      else toast.success("Tag NFC retiré.");
    });
  }

  async function handleScan() {
    const Ctor = (window as unknown as { NDEFReader?: NDEFReaderCtor }).NDEFReader;
    if (!Ctor) {
      toast.error("NFC non supporté sur cet appareil. Saisis l'UID manuellement.");
      return;
    }
    try {
      setScanning(true);
      const reader = new Ctor();
      await reader.scan();
      reader.addEventListener("reading", (e) => {
        const uid = e.serialNumber;
        // Best-effort : écrit l'URL de résolution sur le tag pour que les
        // iPhones (lecture NFC native) ouvrent directement la fiche.
        reader
          .write({
            records: [
              { recordType: "url", data: `${resolverBaseUrl}/t/${uid}` },
            ],
          })
          .catch(() => {});
        setScanning(false);
        associate(uid);
      });
    } catch {
      setScanning(false);
      toast.error("Échec du scan NFC. Vérifie les autorisations ou saisis l'UID.");
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Nfc className="size-5 text-trail" />
        <h2 className="font-bold text-earth">Tag NFC</h2>
      </div>

      {nfcUid ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-trail">
            UID associé :{" "}
            <code className="font-mono text-earth">{nfcUid}</code>
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleRemove}
            className="text-brick hover:border-brick hover:bg-brick-soft"
          >
            <Trash2 className="size-4" />
            Retirer
          </Button>
        </div>
      ) : (
        <p className="text-sm text-trail">
          Aucun tag associé. Scanne un autocollant NFC ou saisis son UID pour
          ouvrir cette fiche d&apos;un simple scan.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant="info"
          size="sm"
          disabled={pending || scanning}
          onClick={handleScan}
        >
          <ScanLine className="size-4" />
          {scanning ? "Approche le tag…" : nfcUid ? "Re-scanner" : "Scanner un tag"}
        </Button>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) associate(manual);
          }}
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="UID manuel (ex. 04:A2:…)"
            className="w-44"
          />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Associer
          </Button>
        </form>
      </div>
    </section>
  );
}
