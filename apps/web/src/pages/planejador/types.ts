export interface Plan {
  id: string;
  title: string;
  objective: string;
  totalPosts: number;
  metadata: { summary?: { carouselCount?: number; imageCount?: number; storiesCount?: number } };
  posts: Post[];
}

export interface Post {
  id: string;
  dayIndex: number;
  postType: 'carousel' | 'image' | 'stories';
  platform: string;
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  status: string;
}
