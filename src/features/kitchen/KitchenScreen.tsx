import React, { useMemo, useState } from "react";
import { Search, ChefHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecipeCard } from "./RecipeCard";
import { useRecipes } from "./useRecipes";
import { CATEGORY_META, type RecipeCategory } from "./types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export function KitchenScreen() {
  const { recipes, loading } = useRecipes();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<RecipeCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (category !== "all" && !r.categories?.includes(category)) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [recipes, search, category]);

  return (
    <div className="min-h-screen gradient-bg pb-24">
      <header className="sticky top-0 z-40 bg-slate-50/95 backdrop-blur">
        <div className="max-w-md mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>👋</span>
            <span>{greeting()}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              What would you like<br />to cook today?
            </h1>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <ChefHat className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full h-12 pl-11 pr-4 rounded-full bg-white border border-pink-100 shadow-sm text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="max-w-md mx-auto pb-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4">
            {CATEGORY_META.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key as any)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs font-medium border transition-all",
                    active
                      ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white border-transparent shadow-md shadow-pink-500/30"
                      : "bg-white text-gray-700 border-pink-100 hover:border-pink-200"
                  )}
                >
                  <span>{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden bg-white border border-pink-100"
              >
                <div className="aspect-square bg-pink-100/60 animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-pink-100/70 rounded animate-pulse" />
                  <div className="h-2.5 w-2/3 bg-pink-100/50 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
            No recipes match your search yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
