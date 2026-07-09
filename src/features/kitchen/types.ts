export type RecipeDifficulty = "easy" | "medium" | "hard";
export type RecipeDiet = "veg" | "non_veg" | "egg";
export type RecipeCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snacks"
  | "healthy"
  | "kids"
  | "quick";

export interface Recipe {
  id: string;
  slug: string;
  name: string;
  image_url: string;
  cooking_time_min: number;
  difficulty: RecipeDifficulty;
  diet: RecipeDiet;
  categories: RecipeCategory[];
  calories?: number | null;
  serves?: number | null;
  is_active?: boolean;
}

export const CATEGORY_META: {
  key: RecipeCategory | "all";
  label: string;
  emoji: string;
}[] = [
  { key: "all", label: "All", emoji: "✨" },
  { key: "breakfast", label: "Breakfast", emoji: "🌅" },
  { key: "lunch", label: "Lunch", emoji: "🍛" },
  { key: "dinner", label: "Dinner", emoji: "🌙" },
  { key: "snacks", label: "Snacks", emoji: "🍿" },
  { key: "healthy", label: "Healthy", emoji: "🥗" },
  { key: "kids", label: "Kids", emoji: "🧒" },
  { key: "quick", label: "Quick 10 Min", emoji: "⚡" },
];
