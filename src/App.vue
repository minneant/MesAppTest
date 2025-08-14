<template>
  <header class="topnav">
    <nav class="navwrap">
      <div class="brand" @click="$router.push('/')">Home</div>

      <ul class="nav">
        <!-- 1) 생산실적 조회 (단일 링크) -->
        <li class="nav-item">
          <RouterLink
            class="nav-link"
            :class="{active: isActive('/production-history')}"
            to="/production-history"
            @click="close()"
          >
            생산실적 조회
          </RouterLink>
        </li>

        <!-- 구분선 -->
        <li class="sep" aria-hidden="true"></li>

        <!-- 2) 재고 조회 (단일 링크) -->
        <li class="nav-item">
          <RouterLink
            class="nav-link"
            :class="{active: isActive('/inventory')}"
            to="/inventory"
            @click="close()"
          >
            재고 조회
          </RouterLink>
        </li>

        <!-- 구분선 -->
        <li class="sep" aria-hidden="true"></li>

        <!-- 3) 생산실적 입력 (드롭다운) -->
        <li class="nav-item nav-group" @keydown.escape="openGroup=null">
          <button
            class="nav-btn"
            :class="{open: openGroup==='생산실적 입력'}"
            @click="toggle('생산실적 입력')"
            type="button"
          >
            생산실적 입력
            <span class="caret">▾</span>
          </button>
          <ul v-if="openGroup==='생산실적 입력'" class="dropdown">
            <li><RouterLink class="dd-link" to="/produce-foaming"    @click="close()">발포 공정</RouterLink></li>
            <li><RouterLink class="dd-link" to="/produce-frp"        @click="close()">FRP 공정</RouterLink></li>
            <li><RouterLink class="dd-link" to="/produce-finishing"  @click="close()">가공 공정</RouterLink></li>
            <li><RouterLink class="dd-link" to="/produce-packaging"  @click="close()">포장 공정</RouterLink></li>
          </ul>
        </li>

        <!-- 구분선 -->
        <li class="sep" aria-hidden="true"></li>

        <!-- 4) 아이템 관리 (드롭다운) -->
        <li class="nav-item nav-group" @keydown.escape="openGroup=null">
          <button
            class="nav-btn"
            :class="{open: openGroup==='아이템 관리'}"
            @click="toggle('아이템 관리')"
            type="button"
          >
            아이템 관리
            <span class="caret">▾</span>
          </button>
          <ul v-if="openGroup==='아이템 관리'" class="dropdown">
            <li><RouterLink class="dd-link" to="/bulk-boms"       @click="close()">BOM 대량 생성</RouterLink></li>
            <li><RouterLink class="dd-link" to="/bom-manage"      @click="close()">BOM 관리</RouterLink></li>
            <li><RouterLink class="dd-link" to="/bulk-items"      @click="close()">Item 대량 생성</RouterLink></li>
            <li><RouterLink class="dd-link" to="/item-manage"     @click="close()">Item 관리</RouterLink></li>
            <li><RouterLink class="dd-link" to="/masters-manage"  @click="close()">기타태그 관리</RouterLink></li>
          </ul>
        </li>
      </ul>
    </nav>
  </header>

  <main class="content">
    <RouterView />
  </main>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const openGroup = ref<string|null>(null)

function toggle(name: string){ openGroup.value = (openGroup.value === name) ? null : name }
function close(){ openGroup.value = null }
function isActive(path: string){ return route.path === path }

function onDocClick(e: MouseEvent){
  const nav = document.querySelector('.navwrap')
  if (nav && e.target instanceof Node && !nav.contains(e.target)) close()
}

onMounted(()=> document.addEventListener('click', onDocClick, true))
onBeforeUnmount(()=> document.removeEventListener('click', onDocClick, true))
</script>

<style scoped>
:root {
  --border:#e5e7eb;
  --divider:#eef2f0;  /* 아주 연한 구분선 */
  --muted:#6b7280;
  --green:#059669;     /* emerald-600 */
  --green-50:#ecfdf5;
  --green-100:#d1fae5;
}

.topnav{
  position:sticky; top:0; z-index:50;
  background:#fff; border-bottom:1px solid var(--border);
  box-shadow: 0 6px 16px rgba(16,185,129,.05);
}
.navwrap{
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; padding:10px 16px; /* ✅ 가로 꽉 차게: max-width, margin 제거 */
}
.brand{
  font-weight:800; letter-spacing:.3px; cursor:pointer;
  color:#065f46;  /* deep green */
  font-size: 1.05rem;
}

/* nav */
.nav{ display:flex; align-items:center; gap:8px; list-style:none; padding:0; margin:0; }
.nav-item{ position:relative; display:flex; align-items:center; }

/* 아주 연한 구분선 */
.sep{
  width:1px; height:22px; background:var(--divider);
  margin: 0 6px;
  border-radius: 1px;
}

/* button/link base */
.nav-btn, .nav-link{
  display:inline-flex; align-items:center; gap:6px;
  border:1px solid var(--border); background:#fff;
  padding:.52rem .78rem; border-radius:.65rem; font-size:1rem; cursor:pointer;
  text-decoration:none; color:#111827; transition:.15s;
}
.nav-btn:hover, .nav-link:hover{ background:#f9fafb; }
.nav-link.active{
  border-color:var(--green); color:#fff; background:var(--green);
}
.nav-btn.open{
  background: var(--green-50); border-color: var(--green-100);
}
.caret{ font-size:.85rem; color:var(--muted); }

/* dropdown */
.dropdown{
  position:absolute; left:0; top:100%; margin-top:6px; min-width:200px;
  background:#fff; border:1px solid var(--border); border-radius:.75rem;
  padding:.5rem; box-shadow:0 12px 28px rgba(5,150,105,.12);
}
.dd-link{
  display:block; padding:.56rem .65rem; border-radius:.55rem;
  color:#111827; text-decoration:none; white-space:nowrap; transition:.12s;
  font-size: .98rem;
}
.dd-link:hover{ background:#f0fdf4; color:#065f46; }

/* ✅ 페이지 본문: 가로 꽉 채우기 (여백 복원) */
.content{
  padding:14px 16px;  /* 좌우 패딩만 유지 */
  /* max-width 제거, 가운데 정렬 제거 */
}
</style>
