import { AuthGate } from "@/client/components/AuthGate";
import { FileAdminPage } from "@/client/components/FileAdminPage";

export default function FilePage() {
  return (
    <AuthGate>
      <FileAdminPage />
    </AuthGate>
  );
}
