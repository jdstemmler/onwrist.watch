<script lang="ts">
	import WatchForm from '$lib/components/WatchForm.svelte';
	import { watchLabel } from '$lib/watch-label';

	let { data } = $props();
</script>

<svelte:head>
	<title>Edit {watchLabel(data.watch)} — {data.appName}</title>
</svelte:head>

<WatchForm watch={data.watch} photos={data.photos} />
