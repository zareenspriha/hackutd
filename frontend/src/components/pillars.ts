import { ArrowLeftRight, CalendarClock, FileCheck2, HandCoins, HandHeart, Home, MessageCircle, ScanLine, Sparkles, Wallet } from "lucide-react";
import type { SceneId } from "./ui";

type Item = { id: SceneId; label: string; icon: typeof Home };
type Pillar = { key: "prove" | "fund" | "navigate"; n: number; title: string; blurb: string; items: Item[] };
export const PILLARS: Pillar[] = [
  {
    key: "prove", n: 1, title: "Prove what you lost", blurb: "Scan your rooms. looma builds your claim.",
    items: [
      { id: "scan", label: "Home scans", icon: ScanLine },
      { id: "compare", label: "What changed", icon: ArrowLeftRight },
      { id: "claim", label: "Your claim", icon: FileCheck2 },
    ],
  },
  {
    key: "fund", n: 2, title: "Get money now", blurb: "Cash today, repaid when the claim pays.",
    items: [
      { id: "fund", label: "Bridge funds", icon: HandCoins },
      { id: "bills", label: "Bills", icon: CalendarClock },
      { id: "circle", label: "Help circle", icon: HandHeart },
    ],
  },
  {
    key: "navigate", n: 3, title: "Plan what's next", blurb: "Ask anything. One next step at a time.",
    items: [
      { id: "ask", label: "Ask looma", icon: MessageCircle },
      { id: "picture", label: "My money", icon: Wallet },
      { id: "wait", label: "What if", icon: Sparkles },
    ],
  },
];
export const pillarOf = (id: SceneId) => PILLARS.find((p) => p.items.some((i) => i.id === id));
