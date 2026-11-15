import { rspack } from "@rspack/core"

export default {
  entry: "./src/main.tsx",
  resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"] },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: { syntax: "typescript", tsx: true },
            transform: { react: { runtime: "automatic" } }
          }
        }
      },
      { test: /\.css$/, type: "css" }
    ]
  },
  plugins: [new rspack.HtmlRspackPlugin({ template: "./index.html" })]
}
