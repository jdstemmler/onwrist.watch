<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Nav from '$lib/components/Nav.svelte';
	let { children, data } = $props();
</script>

{#if page.route.id !== '/login'}
	<Nav appName={data.appName} />
{/if}
<main>{@render children()}</main>
