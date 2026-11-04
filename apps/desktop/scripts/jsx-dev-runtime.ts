// What the window imports as `react/jsx-dev-runtime` on React's production build, which leaves `jsxDEV` out; see
// react-build.ts. The extra arguments `jsxDEV` is called with, such as its source location, are ones `jsx` ignores.
export { Fragment, jsx as jsxDEV } from "react/jsx-runtime"
