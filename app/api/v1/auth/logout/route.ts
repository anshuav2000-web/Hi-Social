import { handleApiError, ok } from "@/lib/http";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return ok({ signedOut: true });
  } catch (err) {
    return handleApiError(err);
  }
}
