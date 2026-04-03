export async function readImageAsDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read the selected image."));
    reader.readAsDataURL(file);
  });
}
