<template>
  <section class="wrap">
    <!-- Hero -->
    <div class="hero">
      <h1>MES for 대원산업<span class="thin"></span></h1>
      <p class="sub">생산·아이템·BOM을 한눈에 — 아래 메뉴에서 바로 시작하세요</p>
    </div>

    <!-- 펼친 네비: 1) 정보조회 2) 입력 3) 아이템 관리 -->
    <div class="grid">
      <!-- 1) 정보조회 -->
      <div class="card">
        <h2>정보조회</h2>
        <div class="links">
          <RouterLink class="link" to="/production-history">
            생산 실적 조회
          </RouterLink>
          <RouterLink class="link" to="/production-history?preset=shipping">
            출하 실적 조회
          </RouterLink>
          <RouterLink class="link" to="/inventory">
            재고 조회
          </RouterLink>
        </div>
      </div>

      <!-- 2) 생산실적 입력 -->
      <div class="card">
        <h2>생산실적 입력</h2>
        <div class="links">
          <RouterLink class="link" to="/produce-foaming">발포 공정</RouterLink>
          <RouterLink class="link" to="/produce-frp">FRP 공정</RouterLink>
          <RouterLink class="link" to="/produce-glue">글루 공정</RouterLink>
          <RouterLink class="link" to="/produce-finishing">가공/커팅 공정</RouterLink>
          <RouterLink class="link" to="/produce-packaging">포장 공정</RouterLink>
        </div>
      </div>

      <!-- 3) 아이템 관리 -->
      <div class="card">
        <h2>아이템 관리</h2>
        <div class="links">
          <RouterLink class="link" to="/bulk-boms">BOM 대량 생성</RouterLink>
          <RouterLink class="link" to="/bom-manage">BOM 관리</RouterLink>
          <RouterLink class="link" to="/bulk-items">Item 대량 생성</RouterLink>
          <RouterLink class="link" to="/item-manage">Item 관리</RouterLink>
          <RouterLink class="link" to="/master-manage">기타태그 관리</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// no-op
</script>

<style scoped>
/* Layout */
.wrap { max-width: 1100px; margin: 0 auto; padding: 28px 16px; display: grid; gap: 20px; }

/* Hero */
.hero {
  text-align: center;
  padding: 36px 16px 20px;
  border-radius: 18px;
  /* 연한 그린 배경 그라디언트 */
  background: radial-gradient(1200px 420px at 50% -20%, #bbf7d0 0%, transparent 60%);
}
.hero h1 { margin: 0; font-size: clamp(28px, 5vw, 56px); font-weight: 800; letter-spacing: .2px; color: #0f172a; }
.hero .thin { font-weight: 300; }
.hero .sub { margin: 10px 0 0; color: #6b7280; font-size: 14px; }

/* Cards */
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
@media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }

.card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  padding: 14px;
  box-shadow: 0 6px 18px rgba(5, 150, 105, .08);
}
.card h2 { margin: 2px 0 12px; font-size: 16px; font-weight: 700; color: #065f46; }

/* 리스트 컨테이너 */
.links { display: grid; gap: 8px; margin: 0; padding: 0; align-content: start; }

/* 버튼(기본형) — 모두 동일 규격 */
.link {
  display: inline-flex; align-items: center; justify-content: center;
  height: 42px; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 0 12px; text-decoration: none; background: #fff; transition: .15s;
  font-size: .98rem; line-height: 1;
}

/* 전역 a 스타일 무력화: 기본/visited 동일 색 */
a.link, a.link:visited { color: #111827 !important; }

/* hover 효과도 모든 버튼 동일 */
.link:hover { background: #f0fdf4; transform: translateY(-1px); color: #065f46 !important; }
.link:active { transform: translateY(0); }
</style>
