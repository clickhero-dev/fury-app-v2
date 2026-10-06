import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function MarkdownContent({ markdown }: { markdown: string }) {
  return <article className="prose prose-slate max-w-none dark:prose-invert">
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" />,
    }}>{markdown}</ReactMarkdown>
  </article>;
}
