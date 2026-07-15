<script lang="ts">
	import WatchForm from '$lib/components/WatchForm.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Edit {data.watch.nickname ?? `${data.watch.brand} ${data.watch.model}`} — {data.appName}</title>
</svelte:head>

<WatchForm watch={data.watch} photos={data.photos} />
