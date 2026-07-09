import React from "react";
import { Clock, Leaf, Drumstick, Egg, Flame } from "lucide-react";
import type { Recipe } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  recipe: Recipe;
  onClick?: (recipe: Recipe) => void;
}

const DIFFICULTY_LABEL: Record<Recipe["difficulty"], string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export function RecipeCard({ recipe, onClick }: Props) {
  const dietIcon =
    recipe.diet === "veg" ? (
      <Leaf className="w-3 h-3" />
    ) : recipe.diet === "egg" ? (
      <Egg className="w-3 h-3" />
    ) : (
      <Drumstick className="w-3 h-3" />
    );
  const dietLabel =
    recipe.diet === "veg" ? "Veg" : recipe.diet === "egg" ? "Egg" : "Non-Veg";
  const dietColor =
    recipe.diet === "veg"
      ? "bg-emerald-500/95 text-white"
      : recipe.diet === "egg"
        ? "bg-amber-500/95 text-white"
        : "bg-rose-600/95 text-white";

  return (
    <button
      type="button"
      onClick={() => onClick?.(recipe)}
      className="group relative w-full text-left rounded-2xl overflow-hidden bg-white shadow-[0_6px_20px_-8px_rgba(236,72,153,0.25)] border border-pink-100/60 transition-all active:scale-[0.98] hover:shadow-[0_10px_28px_-8px_rgba(236,72,153,0.35)]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-pink-50">
        <img
          src={recipe.image_url}
          alt={recipe.name}
          loading="lazy"
          width={512}
          height={512}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className={cn(
            "absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shadow-sm backdrop-blur-sm",
            dietColor
          )}
        >
          {dietIcon}
          {dietLabel}
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {recipe.name}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {recipe.cooking_time_min} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame className="w-3 h-3" />
            {DIFFICULTY_LABEL[recipe.difficulty]}
          </span>
        </div>
      </div>
    </button>
  );
}
