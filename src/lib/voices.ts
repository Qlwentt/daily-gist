export const VOICES: { name: string; label: string; gender: "M" | "F" }[] = [
  { name: "Achernar", label: "Alice", gender: "F" },
  { name: "Achird", label: "Aaron", gender: "M" },
  { name: "Algenib", label: "Ben", gender: "M" },
  { name: "Algieba", label: "Chris", gender: "M" },
  { name: "Aoede", label: "Bella", gender: "F" },
  { name: "Autonoe", label: "Clara", gender: "F" },
  { name: "Callirrhoe", label: "Diana", gender: "F" },
  { name: "Charon", label: "Daniel", gender: "M" },
  { name: "Despina", label: "Emma", gender: "F" },
  { name: "Enceladus", label: "Eric", gender: "M" },
  { name: "Erinome", label: "Grace", gender: "F" },
  { name: "Fenrir", label: "Frank", gender: "M" },
  { name: "Gacrux", label: "Hannah", gender: "F" },
  { name: "Iapetus", label: "James", gender: "M" },
  { name: "Kore", label: "Isla", gender: "F" },
  { name: "Laomedeia", label: "Julia", gender: "F" },
  { name: "Leda", label: "Kate", gender: "F" },
  { name: "Orus", label: "Kevin", gender: "M" },
  { name: "Puck", label: "Leo", gender: "M" },
  { name: "Pulcherrima", label: "Luna", gender: "F" },
  { name: "Rasalgethi", label: "Marcus", gender: "M" },
  { name: "Sadachbia", label: "Noah", gender: "M" },
  { name: "Sadaltager", label: "Oscar", gender: "M" },
  { name: "Schedar", label: "Ryan", gender: "M" },
  { name: "Sulafat", label: "Mia", gender: "F" },
  { name: "Umbriel", label: "Sam", gender: "M" },
  { name: "Vindemiatrix", label: "Nora", gender: "F" },
  { name: "Zephyr", label: "Olivia", gender: "F" },
  { name: "Zubenelgenubi", label: "Tom", gender: "M" },
];

/** Look up the human-friendly alias for a Gemini voice name */
export function getVoiceAlias(geminiName: string): string {
  return VOICES.find((v) => v.name === geminiName)?.label ?? geminiName;
}

/** Get the gender of a voice by its Gemini name */
export function getVoiceGender(geminiName: string): "M" | "F" {
  return VOICES.find((v) => v.name === geminiName)?.gender ?? "M";
}
