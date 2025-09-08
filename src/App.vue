<template>
  <header class="topnav">
    <nav class="navwrap">
      <div class="left-group">
        <div class="brand" @click="$router.push('/')">Home</div>
        <!-- ✅ 로그인 사용자 표시 -->
        <div class="user-chip" v-if="userEmail" @click="handleLogout" title="로그아웃">
          <!-- ✅ SVG 아이콘 -->
          <svg xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-5 h-5 text-gray-600">
            <path stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>

          <span class="user-name">{{ displayName }}</span>
        </div>
      </div>

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
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'

const route = useRoute()
const router = useRouter()
const openGroup = ref<string|null>(null)
const userEmail = ref<string|null>(null)

function toggle(name: string){ openGroup.value = (openGroup.value === name) ? null : name }
function close(){ openGroup.value = null }
function isActive(path: string){ return route.path === path }

function onDocClick(e: MouseEvent){
  const nav = document.querySelector('.navwrap')
  if (nav && e.target instanceof Node && !nav.contains(e.target)) close()
}

onMounted(()=> {
  document.addEventListener('click', onDocClick, true)
  const auth = getAuth()
  onAuthStateChanged(auth, (user) => {
    userEmail.value = user?.email || null
  })
})
onBeforeUnmount(()=> document.removeEventListener('click', onDocClick, true))

const displayName = computed(() => userEmail.value ? userEmail.value.split('@')[0] : '')

async function handleLogout() {
  if (confirm("로그아웃 하시겠습니까?")) {
    await signOut(getAuth())
    router.push("/login")
  }
}
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
  gap:12px; padding:10px 16px;
}
.brand{
  font-weight:800; letter-spacing:.3px; cursor:pointer;
  color:#065f46; font-size: 1.05rem;
}

/* ✅ Home + user-chip 묶음 */
.left-group{
  display:flex; align-items:center; gap:10px;
}

/* ✅ 로그인 사용자 표시 */
.user-chip{
  display:flex; align-items:center; gap:6px;
  padding:2px 6px;
  border-radius:8px;
  color:#065f46; cursor:pointer; user-select:none;
}
.user-chip:hover{ background:#f0fdf4; }
.user-icon{ font-size:0.95rem; }
.user-name{ font-weight:600; font-size:0.95rem; }
/* ✅ 기본: 데스크탑/태블릿에서는 아이콘 + 이름 노출 */
.user-chip .user-icon { display: inline-block; }
.user-chip .user-name { display: inline-block; }

/* ✅ 모바일 세로(가로폭 600px 이하)에서는 이름 숨김, 아이콘만 */
@media (max-width: 600px) {
  .user-chip { gap: 4px; padding: 2px 4px; } /* 살짝 더 컴팩트하게 */
  .user-chip .user-name { display: none; }    /* ← 이름 숨김 */
  .user-chip .user-icon { font-size: 1rem; }  /* 필요시 아이콘 조금 키우기 */
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

/* 본문 */
.content{ padding:14px 16px; }
</style>
