<script lang="ts">
	import WatchForm from '$lib/components/WatchForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Add watch — {data.appName}</title>
</svelte:head>

<WatchForm />
