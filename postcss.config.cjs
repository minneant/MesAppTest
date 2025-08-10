// postcss.config.cjs
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {}, // ✅ v4에서는 이 플러그인을 사용
    autoprefixer: {},
  },
};
