/**
 * Default PC game tiles for café kiosks.
 *
 * Paths are typical Windows installs — owners can edit per café in the dashboard
 * if a game lives somewhere else on their PCs.
 */
export type CafePcGameRow = {
  name: string;
  exe_path: string;
  arguments?: string | null;
  process_name?: string | null;
  icon_path?: string | null;
  working_directory?: string | null;
  sort_order: number;
};

export const DEFAULT_CAFE_PC_GAMES: CafePcGameRow[] = [
  {
    name: "Valorant",
    exe_path: "C:\\Riot Games\\Riot Client\\RiotClientServices.exe",
    arguments: "--launch-product=valorant --launch-patchline=live",
    process_name: "VALORANT-Win64-Shipping",
    sort_order: 1,
  },
  {
    name: "GTA V",
    exe_path: "C:\\Program Files\\Epic Games\\GTAV\\PlayGTAV.exe",
    process_name: "GTA5",
    sort_order: 2,
  },
  {
    name: "Fortnite",
    exe_path: "C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe",
    process_name: "FortniteClient-Win64-Shipping",
    sort_order: 3,
  },
  {
    name: "Counter-Strike 2",
    exe_path: "C:\\Program Files (x86)\\Steam\\steam.exe",
    arguments: "-applaunch 730",
    process_name: "cs2",
    sort_order: 4,
  },
  {
    name: "Minecraft",
    exe_path: "C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe",
    process_name: "javaw",
    sort_order: 5,
  },
  {
    name: "EA SPORTS FC",
    exe_path: "C:\\Program Files\\EA Games\\EA SPORTS FC 25\\FC25.exe",
    process_name: "FC25",
    sort_order: 6,
  },
  {
    name: "PUBG",
    exe_path: "C:\\Program Files (x86)\\Steam\\steam.exe",
    arguments: "-applaunch 578080",
    process_name: "TslGame",
    sort_order: 7,
  },
  {
    name: "Rocket League",
    exe_path: "C:\\Program Files (x86)\\Steam\\steam.exe",
    arguments: "-applaunch 252950",
    process_name: "RocketLeague",
    sort_order: 8,
  },
];

export function mapGameRowToAgentJson(row: CafePcGameRow) {
  return {
    name: row.name,
    exePath: row.exe_path,
    arguments: row.arguments ?? null,
    processName: row.process_name ?? null,
    iconPath: row.icon_path ?? null,
    workingDirectory: row.working_directory ?? null,
  };
}
