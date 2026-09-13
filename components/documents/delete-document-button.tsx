"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export function DeleteDocumentButton({ documentId, filename, storagePath }: { documentId: string; filename: string; storagePath: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!window.confirm(`Delete ${filename}? This cannot be undone.`)) return;
    setDeleting(true);
    const client = getSupabaseBrowserClient();
    if (storagePath && storagePath !== "blank") {
      const { error: storageError } = await client.storage.from("documents").remove([storagePath]);
      if (storageError) {
        setDeleting(false);
        window.alert(storageError.message);
        return;
      }
    }
    const { error: documentError } = await client.from("documents").delete().eq("id", documentId);
    if (documentError) {
      setDeleting(false);
      window.alert(documentError.message);
      return;
    }
    router.refresh();
  };

  return <button className="document-delete" type="button" onClick={() => void remove()} disabled={deleting} aria-label={`Delete ${filename}`} title="Delete document">{deleting ? "..." : "Delete"}</button>;
}