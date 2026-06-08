import express, { Request, Response } from "express";
import cors from "cors";
import axios from "axios";
import cheerio from "cheerio";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3300;

/* ---------------- TYPES ---------------- */

interface FruitObj {
  name: string;
  price: number;
}

/* ---------------- SOURCES ---------------- */

const SOURCES = [
  {
    name: "fandom",
    url: "https://blox-fruits.fandom.com/wiki/Blox_Fruits_%22Stock%22",
  },
];

/* ---------------- CACHE (important for Render stability) ---------------- */

let lastGoodResponse: FruitObj[] = [];

/* ---------------- HELPERS ---------------- */

const cleanNumber = (val: string) => {
  if (!val) return 0;
  const num = parseFloat(val.replace(/,/g, "").replace(/[^\d.]/g, ""));
  return isNaN(num) ? 0 : num;
};

const fetchHTML = async (url: string) => {
  const res = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
  });

  return res.data;
};

/* ---------------- SCRAPER ---------------- */

const scrapeFandom = (html: string): FruitObj[] => {
  const $ = cheerio.load(html);

  const names: string[] = [];
  const prices: string[] = [];

  $("#mw-customcollapsible-current figure figcaption a[title]").each(
    (_, el) => {
      const name = $(el).attr("title");
      if (name) names.push(name);
    }
  );

  $("#mw-customcollapsible-current span").each((_, el) => {
    const price = $(el).text().trim();
    if (price && /\d/.test(price)) prices.push(price);
  });

  const result: FruitObj[] = [];

  const len = Math.min(names.length, prices.length);

  for (let i = 0; i < len; i++) {
    result.push({
      name: names[i],
      price: cleanNumber(prices[i]),
    });
  }

  return result;
};

/* ---------------- CORE FUNCTION ---------------- */

const getStock = async (): Promise<FruitObj[]> => {
  try {
    for (const source of SOURCES) {
      try {
        const html = await fetchHTML(source.url);

        if (source.name === "fandom") {
          const data = scrapeFandom(html);

          if (data.length > 0) {
            lastGoodResponse = data;
            return data;
          }
        }
      } catch (err) {
        console.log(`❌ Source failed: ${source.name}`);
      }
    }

    // fallback
    return lastGoodResponse;
  } catch (err) {
    console.log("❌ GLOBAL ERROR:", err);
    return lastGoodResponse;
  }
};

/* ---------------- ROUTES ---------------- */

app.get("/", (req: Request, res: Response) => {
  res.json({
    status: "online",
    message: "Blox Fruits Stock API",
    endpoints: {
      currentStock: "/v1/currentstock",
      lastStock: "/v1/laststock",
    },
  });
});

app.get("/v1/currentstock", async (req: Request, res: Response) => {
  try {
    const data = await getStock();

    if (!data || data.length === 0) {
      return res.status(200).json({
        warning: "no data scraped, returning cache",
        data: lastGoodResponse,
      });
    }

    res.json(data);
  } catch (err) {
    console.log("❌ ROUTE ERROR:", err);
    res.status(500).json({
      error: "current stock failed safely handled",
      fallback: lastGoodResponse,
    });
  }
});

app.get("/v1/laststock", async (req: Request, res: Response) => {
  try {
    const data = await getStock();
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: "last stock failed safely handled",
      fallback: lastGoodResponse,
    });
  }
});

/* ---------------- START SERVER ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
