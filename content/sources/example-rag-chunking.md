# 素材示例：RAG 文本切分

> 用途：演示 `node tools/gen-questions.mjs --draft content/sources/example-rag-chunking.md --offline`。
> 真实使用时，把论文摘要、官方文档段落、规范条款原文粘进来即可（保留可引用的原文，便于生成 snippet）。

Chunk overlap is helpful in maintaining continuity between chunks, ensuring that information isn't lost
when it spans across multiple chunks. A common starting point is a chunk size of 512 to 1024 tokens with
an overlap of 10% to 20% of the chunk size, then adjusted by document structure such as heading levels,
code blocks and tables.

Recursive character splitting tries to keep semantically related pieces of text together by splitting on a
priority list of separators, typically paragraph breaks first, then sentence boundaries, and only falling
back to fixed-width splits when no separator produces a small enough chunk.
