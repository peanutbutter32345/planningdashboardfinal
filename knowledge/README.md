# Optional planning knowledge base

Drop official PDFs, reports, spreadsheets exported to supported document formats, meeting packets, Housing Elements, General Plans, Specific Plans, transportation plans, CIP documents, and other source files here.

Then run:

```bash
npm run vector:create
```

The script creates an OpenAI vector store, uploads the files, and prints an `OPENAI_VECTOR_STORE_ID` value to add to `.env`.

Do not place secrets or your `.env` file in this folder.
