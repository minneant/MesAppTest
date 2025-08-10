<template>
  <nav style="display:flex; gap:12px; padding:12px; border-bottom:1px solid #eee">
    <router-link to="/produce">생산량집계</router-link>
    <router-link to="/produce-fo">실적-발포공정</router-link>
    <router-link to="/bulk-items">아이템 대량생성</router-link>
    <router-link to="/items-manage">아이템 관리</router-link>
  </nav>
  <router-view />
</template>