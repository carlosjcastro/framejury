import { ApiError } from "@/lib/api";

export interface Problem {
  code: string;
  title: string;
  body: string;
  /** a command the person can copy and run */
  command?: string;
  /** short hint shown after the command */
  hint?: string;
  /** technical detail, kept out of the way */
  detail?: string;
}

const START_ENGINE = "uvicorn keeper.api:app --port 8000";

export function problemFor(
  code: string,
  info: Record<string, unknown> = {},
  detail?: string,
): Problem {
  const folder = typeof info.folder === "string" ? info.folder : "that folder";
  const model = typeof info.model === "string" ? info.model : "the model";

  switch (code) {
    case "api_down":
      return {
        code,
        title: "Framejury can’t reach its engine",
        body: "The page is open, but the local engine that analyzes your photos isn’t answering. Start it from the backend folder with your environment active, then try again.",
        command: START_ENGINE,
        hint: "If you changed the port, set NEXT_PUBLIC_API_URL to match.",
      };
    case "ollama_down":
      return {
        code,
        title: "Ollama isn’t running",
        body: "Framejury asks a Gemma model to compare similar shots, and Ollama is what runs it on your computer. Open the Ollama app, or start it from a terminal, and try again. You can also analyze without the model.",
        command: "ollama serve",
      };
    case "model_missing":
      return {
        code,
        title: "The model isn’t downloaded yet",
        body: `Ollama is running, but it doesn’t have ${model}. Download it once and it stays on your computer. It can take a few minutes.`,
        command: `ollama pull ${model}`,
      };
    case "model_not_vision":
      return {
        code,
        title: "This model can’t look at images",
        body: `${model} reads text only. Pick a vision model in Advanced options, or analyze without the model.`,
      };
    case "folder_missing":
      return {
        code,
        title: "That folder doesn’t exist",
        body: `Framejury couldn’t open ${folder}. Check the spelling, and that the drive is connected. Paste the full path, for example C:\\photos\\wedding.`,
      };
    case "no_photos":
      return {
        code,
        title: "No photos found",
        body: `There are no photos in ${folder} that match your current file types and filters. If they sit inside subfolders, turn on “Include subfolders” in Advanced options.`,
      };
    case "need_folder":
      return {
        code,
        title: "Type a folder first",
        body: "Paste the full path of the folder with your photos, then choose what to do with it.",
      };
    case "analysis_failed":
      return {
        code,
        title: "The analysis stopped",
        body: "Something went wrong while Framejury was working. Your photos weren’t changed. Try again, and if it keeps happening, analyze without the model to see if it’s related.",
        detail,
      };
    default:
      return {
        code,
        title: "That didn’t work",
        body:
          detail ||
          "Something unexpected happened. Your photos weren’t changed. Try again.",
      };
  }
}

export function explain(error: unknown): Problem {
  if (error instanceof ApiError)
    return problemFor(error.code, error.info, error.message);
  const message = error instanceof Error ? error.message : String(error);
  return problemFor("unknown", {}, message);
}

export function readFailure(message: string): string {
  if (
    /cannot identify|truncated|broken|corrupt|decode|unrecognized|premature|invalid/i.test(
      message,
    )
  ) {
    return "The file looks damaged or incomplete.";
  }
  if (/raw|libraw/i.test(message))
    return "This RAW format couldn’t be decoded.";
  if (/permission|denied|in use/i.test(message))
    return "Framejury isn’t allowed to open this file.";
  const short = message.trim().replace(/\s+/g, " ");
  return short.length > 90
    ? `${short.slice(0, 87)}…`
    : short || "The file couldn’t be read.";
}
