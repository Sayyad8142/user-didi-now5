import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SEED_RECIPES } from "./recipes.seed";
import type { Recipe } from "./types";

/**
 * Loads recipes from the external `recipes` table.
 * Falls back to the local seed if the table is missing or empty
 * (e.g. before docs/kitchen-recipes-migration.sql has been run).
 */
export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>(SEED_RECIPES);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"db" | "seed">("seed");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("recipes")
          .select(
            "id, slug, name, image_url, cooking_time_min, difficulty, diet, categories, calories, serves, is_active"
          )
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (cancelled) return;
        if (!error && Array.isArray(data) && data.length > 0) {
          setRecipes(data as Recipe[]);
          setSource("db");
        } else {
          setRecipes(SEED_RECIPES);
          setSource("seed");
        }
      } catch {
        if (!cancelled) {
          setRecipes(SEED_RECIPES);
          setSource("seed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { recipes, loading, source };
}
