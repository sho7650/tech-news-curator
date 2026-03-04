import { Feed } from "feed";
import { config } from "../config.js";
import type { DB } from "../database.js";
import { getArticles } from "./article-service.js";

export async function generateRssFeed(db: DB): Promise<string> {
  const { items: articleList } = await getArticles(db, 1, 20);

  const feed = new Feed({
    title: "Tech News Curator",
    description: "海外テックニュースの日本語要約",
    id: config.publicUrl,
    link: config.publicUrl,
    language: "ja",
    copyright: "",
  });

  for (const article of articleList) {
    feed.addItem({
      id: article.id,
      title: article.titleJa ?? article.titleOriginal ?? "Untitled",
      link: article.sourceUrl,
      description: article.summaryJa ?? undefined,
      date: article.publishedAt ?? article.createdAt,
      author: article.author ? [{ name: article.author }] : undefined,
    });
  }

  return feed.rss2();
}
