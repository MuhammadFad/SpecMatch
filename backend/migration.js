import slugify from 'slugify';

export function transformParentToChildren(oldDoc) {
    // 1. Generate permutations ONLY for Performance Critical parts (CPU, GPU, RAM)
    // We NO LONGER loop through Storage or OS.
    const performancePermutations = [];

    const cpus = oldDoc.cpu_options?.length ? oldDoc.cpu_options : [{}];
    const gpus = oldDoc.gpu_options?.length ? oldDoc.gpu_options : [{}];
    const rams = oldDoc.mem_options?.length ? oldDoc.mem_options : [{}];

    // Pick defaults for the non-looped parts
    // We take the "best" available OS (usually Windows) and the base storage
    const defaultStorage = oldDoc.storage_options?.[0] || {};
    const defaultOS = oldDoc.os_options?.[0] || {};

    // The Trimmed Loop
    cpus.forEach(cpu => {
        gpus.forEach(gpu => {
            rams.forEach(ram => {
                performancePermutations.push({
                    cpu,
                    gpu,
                    ram,
                    storage: defaultStorage,
                    os: defaultOS
                });
            });
        });
    });

    // 2. Sort by power (CPU Rating + GPU Rating) to find Base Model
    performancePermutations.sort((a, b) => {
        const scoreA = (a.cpu.rating || 0) + (a.gpu.rating || 0);
        const scoreB = (b.cpu.rating || 0) + (b.gpu.rating || 0);
        return scoreA - scoreB;
    });

    // 3. Map to New Schema
    return performancePermutations.map((combo, index) => {

        // --- PREPARE AGGREGATED ARRAYS (Visuals & Ports) ---
        const displayList = (oldDoc.display_options || []).map(d => ({
            size_inch: parseFloat(d.size), resolution_h: d.hres, resolution_v: d.vres,
            refresh_rate_hz: d.hz, panel_type: d.backt, touch: d.touch === 1,
            surface: d.surft, srgb_coverage: d.sRGB, score: d.rating
        }));

        const chassisColors = [...new Set((oldDoc.chassis_options || []).map(c => c.color).filter(Boolean))];
        const chassisMats = [...new Set((oldDoc.chassis_options || []).map(c => c.made).filter(Boolean))];
        const chassisPorts = [...new Set((oldDoc.chassis_options || []).map(c => c.pi).filter(Boolean))];
        const wifiStandards = [...new Set((oldDoc.wnet_options || []).map(w => w.stand).filter(Boolean))];

        // --- UNIQUE SLUG GENERATION ---
        // Removed OS from slug since we aren't looping it
        const slugBase = `${oldDoc.brand} ${oldDoc.name} ${combo.cpu.model} ${combo.gpu.model} ${combo.ram.cap}gb`;

        // Add index to guarantee uniqueness (e.g., if there are 2 identical CPU/GPU/RAM combos but different screens)
        const uniqueSlug = slugify(slugBase, { lower: true, strict: true }) + `-${index}`;

        return {
            group_id: String(oldDoc.id),
            is_base_variant: index === 0,
            slug: uniqueSlug,

            name: `${oldDoc.brand} ${oldDoc.name}`,
            brand: oldDoc.brand,
            model_family: oldDoc.production_family,
            product_url: oldDoc.link,
            images: oldDoc.images || [],

            // --- CRITICAL SPECS ---
            os: `${combo.os.sist || 'Windows'} ${combo.os.vers || '10'} ${combo.os.type || ''}`.trim(),
            architecture: 'x64',

            cpu: {
                name: combo.cpu.model, manufacturer: combo.cpu.prod,
                cores: combo.cpu.cores, threads: (combo.cpu.cores || 1) * 2,
                base_clock_ghz: parseFloat(combo.cpu.clocks),
                boost_clock_ghz: parseFloat(combo.cpu.maxtf),
                tdp_watts: parseFloat(combo.cpu.tdp),
                score: combo.cpu.rating
            },
            gpu: {
                name: combo.gpu.model, manufacturer: combo.gpu.prod,
                vram_gb: combo.gpu.maxmem ? (combo.gpu.maxmem / 1024) : 0,
                tgp_watts: parseFloat(combo.gpu.power),
                integrated: combo.gpu.typegpu === 0,
                features: (combo.gpu.msc || "").split(',').map(s => s.trim()).filter(Boolean),
                score: combo.gpu.rating
            },
            ram: {
                size_gb: combo.ram.cap, type: combo.ram.type, frequency_mhz: combo.ram.freq, score: combo.ram.rating
            },
            storage: {
                // Using the default storage we picked
                capacity_gb: combo.storage.cap, type: combo.storage.type, read_speed_mbps: combo.storage.readspeed, score: combo.storage.rating
            },

            // --- AGGREGATED LISTS ---
            displays: displayList,
            chassis: {
                colors: chassisColors, materials: chassisMats, ports: chassisPorts,
                thickness_mm: parseFloat((oldDoc.chassis_options?.[0] || {}).thic || 0),
                weight_kg: (oldDoc.chassis_options?.[0] || {}).weight || 0,
                webcam_mp: (oldDoc.chassis_options?.[0] || {}).web || 0,
                score: (oldDoc.chassis_options?.[0] || {}).rating
            },
            battery: {
                capacity_wh: (oldDoc.battery_options?.[0] || {}).cap,
                score: (oldDoc.battery_options?.[0] || {}).rating
            },
            networking: {
                wifi_standards: wifiStandards, score: (oldDoc.wnet_options?.[0] || {}).rating
            },

            pricing: {
                estimated_price_usd: (combo.cpu.price || 0) + (combo.gpu.price || 0) + 300,
                currency: 'USD'
            },

            keywords: [
                oldDoc.brand.toLowerCase(),
                combo.gpu.model ? combo.gpu.model.toLowerCase() : '',
                displayList.some(d => d.srgb_coverage > 95) ? 'creator' : '',
                displayList.some(d => d.refresh_rate_hz >= 120) ? 'high-refresh' : '',
                combo.gpu.rating > 50 ? 'gaming' : 'office'
            ].filter(Boolean)
        };
    });
}