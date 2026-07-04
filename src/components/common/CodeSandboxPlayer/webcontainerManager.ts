import { WebContainer } from "@webcontainer/api";

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export const getWebContainer = async (): Promise<WebContainer> => {
  // If it's already running, return it instantly
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  // If it's currently in the middle of booting, wait for it
  if (bootPromise) {
    return bootPromise;
  }

  // Otherwise, start the boot process
  bootPromise = WebContainer.boot()
    .then((instance) => {
      webcontainerInstance = instance;
      return instance;
    })
    .catch((error) => {
      console.error(
        "Failed to boot WebContainer. Check your COOP/COEP headers!",
        error,
      );
      bootPromise = null;
      throw error;
    });

  return bootPromise;
};
