<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	let { children, data } = $props();
</script>

<Nav appName={data.appName} />
<main>{@render children()}</main>
