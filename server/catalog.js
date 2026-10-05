export const catalog = [
  {
    id: "haven-sofa",
    name: "Haven modular sofa",
    category: "Sofas",
    price: 129900,
    description:
      "A soft place to land. Generous cushions, gently rounded arms, and textured upholstery bring effortless comfort to your everyday.",
    material: "Woven upholstery · hardwood frame",
    dimensions: "220 × 95 × 82 cm",
    color: "Warm taupe",
    image: "/images/sofa.jpg",
    stock: 12,
    featured: 1,
  },
  {
    id: "milo-chair",
    name: "Milo lounge chair",
    category: "Chairs",
    price: 44900,
    description:
      "Your new favorite corner. A sculptural lounge chair with a gently reclined seat, made for slow mornings and one more chapter.",
    material: "Woven upholstery · timber legs",
    dimensions: "76 × 82 × 80 cm",
    color: "Stone gray",
    image: "/images/chair.jpg",
    stock: 18,
    featured: 1,
  },
  {
    id: "rowan-table",
    name: "Rowan dining table",
    category: "Tables",
    price: 89900,
    description:
      "Come together around warm, natural wood. A generous six-seat table with an enduring silhouette and beautifully tactile grain.",
    material: "Oak veneer · solid timber legs",
    dimensions: "180 × 90 × 75 cm",
    color: "Warm oak",
    image: "/images/table.jpg",
    stock: 8,
    featured: 1,
  },
  {
    id: "solstice-lamp",
    name: "Solstice table lamp",
    category: "Lighting",
    price: 15900,
    description:
      "A little warmth goes a long way. Diffused light and a sculptural base make this lamp an easy addition to your evening ritual.",
    material: "Ceramic base · fabric shade",
    dimensions: "32 × 32 × 48 cm",
    color: "Ivory",
    image: "/images/lamp.jpg",
    stock: 25,
    featured: 1,
  },
  {
    id: "alma-bed",
    name: "Alma oak bed",
    category: "Bedroom",
    price: 109900,
    description:
      "Make room for rest. A king-size timber bed frame with a warm, welcoming headboard. Mattress sold separately.",
    material: "Oak veneer · timber frame",
    dimensions: "210 × 195 × 110 cm",
    color: "Light oak",
    image: "/images/bed.jpg",
    stock: 6,
    featured: 0,
  },
  {
    id: "oak-sideboard",
    name: "Eden oak sideboard",
    category: "Storage",
    price: 74900,
    description:
      "A home for the things you love. Clean lines and spacious compartments keep everyday essentials thoughtfully tucked away.",
    material: "Oak veneer · timber frame",
    dimensions: "160 × 42 × 75 cm",
    color: "Natural oak",
    image: "/images/sideboard.jpg",
    stock: 9,
    featured: 0,
  },
];
export async function seedCatalog(db) {
  const count = await db.one("SELECT COUNT(*) AS n FROM products");
  if (count.n === 0)
    await db.batch(
      catalog.map((p) => [
        "INSERT OR IGNORE INTO products(id,name,category,price,description,material,dimensions,color,image,stock,featured) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        p.id,
        p.name,
        p.category,
        p.price,
        p.description,
        p.material,
        p.dimensions,
        p.color,
        p.image,
        p.stock,
        p.featured,
      ]),
    );
}
