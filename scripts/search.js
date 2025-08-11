// This file assumes globalLootData and globalLootTableCache are defined in the HTML.
// All functions from your previous code are included to ensure search and
// navigation to reference tables work.

function formatName(str) {
    if (!str) return 'Неизвестно';
    const cleanStr = str.replace(/^.*:(.*)$/, '$1').replace(/^[^/]*\//, '');
    return cleanStr
        .split("_")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function calculateLootChances(lootTable) {
    const aggregatedResults = {};
    if (!lootTable || !lootTable.pools) return [];
    lootTable.pools.forEach(pool => {
        let expectedTotalWeight = 0;
        const entries = pool.entries || [];
        const filteredEntries = [];
        entries.forEach(entry => {
            let shouldBeIgnored = false;
            if (entry.conditions) {
                for (const cond of entry.conditions) {
                    if (cond.condition === "minecraft:entity_properties" &&
                        cond.predicate?.equipment?.offhand?.items?.includes("minecraft:ender_eye")) {
                        shouldBeIgnored = true;
                        break;
                    }
                }
            }
            if (!shouldBeIgnored) {
                filteredEntries.push(entry);
            }
        });
        filteredEntries.forEach(entry => {
            let availability = 1.0;
            if (entry.conditions) {
                entry.conditions.forEach(cond => {
                    if (cond.condition === "minecraft:random_chance" && typeof cond.chance === "number") {
                        availability *= cond.chance;
                    }
                });
            }
            expectedTotalWeight += (entry.weight || 1) * availability;
        });
        if (expectedTotalWeight === 0) return;
        filteredEntries.forEach(entry => {
            let availability = 1.0;
            if (entry.conditions) {
                entry.conditions.forEach(cond => {
                    if (cond.condition === "minecraft:random_chance" && typeof cond.chance === "number") {
                        availability *= cond.chance;
                    }
                });
            }
            const weight = entry.weight || 1;
            const finalChance = (weight * availability) / expectedTotalWeight;
            const rawName = entry.name || entry.value;
            const isLootRef = rawName && (rawName.includes('infinity_cave:refs/') || rawName.includes('infinity_cave/refs/'));
            let count = null;
            if (!isLootRef && entry.functions) {
                const setCount = entry.functions.find(f => f.function === "minecraft:set_count");
                if (setCount && setCount.count) {
                    if (typeof setCount.count === "object") {
                        if ("min" in setCount.count && "max" in setCount.count) {
                            count = (setCount.count.min === setCount.count.max) ? setCount.count.min : `${setCount.count.min}–${setCount.count.max}`;
                        }
                    } else {
                        count = setCount.count;
                    }
                }
            }
            if (!aggregatedResults[rawName]) {
                aggregatedResults[rawName] = {
                    rawName: rawName,
                    name: formatName(rawName),
                    not_chance: 1,
                    count: count,
                    isLootRef: isLootRef,
                };
            }
            aggregatedResults[rawName].not_chance *= (1 - finalChance);
        });
    });
    return Object.values(aggregatedResults)
        .map(item => ({
            ...item,
            chance: ((1 - item.not_chance) * 100).toFixed(2) + "%",
        }));
}

function calculateFlattenedLoot(lootTable, cache, parentChance = 1, processedRefs = new Set()) {
    const aggregatedResults = {};
    function recurse(currentLootTable, currentChance, currentProcessedRefs) {
        if (!currentLootTable || !currentLootTable.pools) return;
        currentLootTable.pools.forEach(pool => {
            const entries = pool.entries || [];
            const filteredEntries = [];
            entries.forEach(entry => {
                let shouldBeIgnored = false;
                if (entry.conditions) {
                    for (const cond of entry.conditions) {
                        if (cond.condition === "minecraft:entity_properties" &&
                            cond.predicate?.equipment?.offhand?.items?.includes("minecraft:ender_eye")) {
                            shouldBeIgnored = true;
                            break;
                        }
                    }
                }
                if (!shouldBeIgnored) {
                    filteredEntries.push(entry);
                }
            });
            let expectedTotalWeight = 0;
            filteredEntries.forEach(entry => {
                let availability = 1.0;
                if (entry.conditions) {
                    entry.conditions.forEach(cond => {
                        if (cond.condition === "minecraft:random_chance" && typeof cond.chance === "number") {
                            availability *= cond.chance;
                        }
                    });
                }
                expectedTotalWeight += (entry.weight || 1) * availability;
            });
            if (expectedTotalWeight === 0) return;
            filteredEntries.forEach(entry => {
                let availability = 1.0;
                if (entry.conditions) {
                    entry.conditions.forEach(cond => {
                        if (cond.condition === "minecraft:random_chance" && typeof cond.chance === "number") {
                            availability *= cond.chance;
                        }
                    });
                }
                const weight = entry.weight || 1;
                const chancePerRoll = (weight * availability) / expectedTotalWeight;
                const finalChancePerRoll = currentChance * chancePerRoll;
                const finalChance = finalChancePerRoll;
                const rawName = entry.name || entry.value;
                const isLootRef = rawName && (rawName.includes('infinity_cave:refs/') || rawName.includes('infinity_cave/refs/'));
                if (isLootRef) {
                    let refLootTablePath = rawName.replace('infinity_cave:', 'infinity_cave/loot_table/');
                    const refLootTable = cache[refLootTablePath];
                    if (refLootTable && !currentProcessedRefs.has(refLootTablePath)) {
                        const newProcessedRefs = new Set(currentProcessedRefs);
                        newProcessedRefs.add(refLootTablePath);
                        recurse(refLootTable, finalChance, newProcessedRefs);
                    }
                } else {
                    let count = null;
                    if (entry.functions) {
                        const setCount = entry.functions.find(f => f.function === "minecraft:set_count");
                        if (setCount && setCount.count) {
                            if (typeof setCount.count === "object") {
                                if ("min" in setCount.count && "max" in setCount.count) {
                                    count = (setCount.count.min === setCount.count.max) ? setCount.count.min : `${setCount.count.min}–${setCount.count.max}`;
                                }
                            } else {
                                count = setCount.count;
                            }
                        }
                    }
                    if (!aggregatedResults[rawName]) {
                        aggregatedResults[rawName] = {
                            rawName: rawName,
                            name: formatName(rawName),
                            not_chance: 1,
                            count: count,
                            isLootRef: false,
                        };
                    }
                    aggregatedResults[rawName].not_chance *= (1 - finalChance);
                }
            });
        });
    }
    recurse(lootTable, parentChance, processedRefs);
    return Object.values(aggregatedResults)
        .map(item => ({
            ...item,
            chance: ((1 - item.not_chance) * 100).toFixed(2) + "%",
        }));
}

function renderLootGrid(lootChances) {
    const itemGrid = document.createElement('div');
    itemGrid.className = 'item-grid';
    lootChances.forEach(item => {
        const itemCard = document.createElement('div');
        itemCard.className = 'item-card';
        if (item.isLootRef) {
            itemCard.classList.add('clickable-card');
            itemCard.addEventListener('click', () => {
                renderReferenceLootTable(item.rawName, item.chance);
            });
        }
        const itemNameSpan = document.createElement('span');
        itemNameSpan.className = 'item-name';
        itemNameSpan.textContent = item.name;
        itemCard.appendChild(itemNameSpan);
        const chanceSpan = document.createElement('span');
        chanceSpan.className = 'item-chance';
        chanceSpan.textContent = item.chance;
        itemCard.appendChild(chanceSpan);
        if (item.count) {
            const countSpan = document.createElement('span');
            countSpan.className = 'item-count';
            countSpan.textContent = `Count: ${item.count}`;
            itemCard.appendChild(countSpan);
        }
        itemGrid.appendChild(itemCard);
    });
    return itemGrid;
}

function renderLootData(data, cache, searchTerm = '') {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';
    const term = searchTerm.toLowerCase();
    const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const biomeSections = document.createElement('div');
    Object.keys(data).sort().forEach(biome => {
        const biomeTitleText = formatName(biome);
        const biomeSection = document.createElement('div');
        biomeSection.className = 'biome-section';
        const biomeTitle = document.createElement('h2');
        biomeTitle.textContent = biomeTitleText;
        biomeSection.appendChild(biomeTitle);
        let biomeHasContent = false;
        rarityOrder.forEach(rarity => {
            if (data[biome][rarity]) {
                const raritySection = document.createElement('div');
                raritySection.className = `rarity-section rarity-${rarity}`;
                const rarityTitle = document.createElement('h3');
                rarityTitle.textContent = formatName(rarity);
                rarityTitle.style.cursor = 'pointer';
                rarityTitle.classList.add('clickable');
                rarityTitle.addEventListener('click', () => {
                    renderSpecificBiomeTierRefLootTable(biome, rarity);
                });
                raritySection.appendChild(rarityTitle);
                let rarityHasContent = false;
                Object.keys(data[biome][rarity]).sort().forEach(mob => {
                    const mobTitleText = formatName(mob);
                    const lootChances = calculateLootChances(data[biome][rarity][mob], cache);
                    const filteredLootChances = lootChances.filter(item => 
                        !term || 
                        mobTitleText.toLowerCase().includes(term) ||
                        item.name.toLowerCase().includes(term)
                    );
                    if (filteredLootChances.length > 0) {
                        const mobTitle = document.createElement('h4');
                        mobTitle.textContent = mobTitleText;
                        raritySection.appendChild(mobTitle);
                        const mobItemGrid = renderLootGrid(filteredLootChances);
                        raritySection.appendChild(mobItemGrid);
                        rarityHasContent = true;
                    }
                });
                if (rarityHasContent) {
                    biomeSection.appendChild(raritySection);
                    biomeHasContent = true;
                }
            }
        });
        if (biomeHasContent) {
            biomeSections.appendChild(biomeSection);
        }
    });
    outputDiv.appendChild(biomeSections);
}

function renderSpecificGearLootTable(tier) {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';
    const backButton = document.createElement('button');
    backButton.textContent = '← Back to all loot tables';
    backButton.className = 'back-button';
    backButton.addEventListener('click', () => {
        renderLootData(globalLootData, globalLootTableCache, document.getElementById('searchInput').value);
    });
    outputDiv.appendChild(backButton);
    const title = document.createElement('h2');
    title.textContent = `${formatName(tier)} Gear Loot Table`;
    outputDiv.appendChild(title);
    const lootTablePath = `infinity_cave/loot_table/refs/${tier}_gear`;
    const lootTable = globalLootTableCache[lootTablePath];
    if (lootTable) {
        const lootChances = calculateLootChances(lootTable, globalLootTableCache);
        const itemGrid = renderLootGrid(lootChances);
        outputDiv.appendChild(itemGrid);
    } else {
        const noItems = document.createElement('p');
        noItems.textContent = 'No gear items found for this tier.';
        outputDiv.appendChild(noItems);
    }
}

function renderSpecificBiomeTierRefLootTable(biome, tier) {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';
    const backButton = document.createElement('button');
    backButton.textContent = '← Back to all loot tables';
    backButton.className = 'back-button';
    backButton.addEventListener('click', () => {
        renderLootData(globalLootData, globalLootTableCache, document.getElementById('searchInput').value);
    });
    outputDiv.appendChild(backButton);
    const title = document.createElement('h2');
    title.textContent = `${formatName(biome)} ${formatName(tier)} Loot Table`;
    outputDiv.appendChild(title);
    const lootTablePath = `infinity_cave/loot_table/refs/${biome}/${tier}`;
    const lootTable = globalLootTableCache[lootTablePath];
    if (lootTable) {
        const lootChances = calculateLootChances(lootTable, globalLootTableCache);
        const itemGrid = renderLootGrid(lootChances);
        outputDiv.appendChild(itemGrid);
    } else {
        const noItems = document.createElement('p');
        noItems.textContent = 'No loot tables found for this reference.';
        outputDiv.appendChild(noItems);
    }
}

function renderReferenceLootTable(rawLootTablePath, parentChanceString) {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';
    const parentChance = parseFloat(parentChanceString) / 100;
    const backButton = document.createElement('button');
    backButton.textContent = '← Back to the previous page';
    backButton.className = 'back-button';
    backButton.addEventListener('click', () => {
        history.back();
    });
    outputDiv.appendChild(backButton);
    const lootTablePath = rawLootTablePath.replace('infinity_cave:', 'infinity_cave/loot_table/');
    const lootTable = globalLootTableCache[lootTablePath];
    const title = document.createElement('h2');
    title.textContent = `Contents of ${formatName(rawLootTablePath)}`;
    outputDiv.appendChild(title);
    if (lootTable) {
        const lootChances = calculateFlattenedLoot(lootTable, globalLootTableCache, parentChance);
        const itemGrid = document.createElement('div');
        itemGrid.className = 'item-grid';
        lootChances.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            const itemNameSpan = document.createElement('span');
            itemNameSpan.className = 'item-name';
            itemNameSpan.textContent = item.name;
            itemCard.appendChild(itemNameSpan);
            const chanceSpan = document.createElement('span');
            chanceSpan.className = 'item-chance';
            chanceSpan.textContent = item.chance;
            itemCard.appendChild(chanceSpan);
            if (item.count) {
                const countSpan = document.createElement('span');
                countSpan.className = 'item-count';
                countSpan.textContent = `Count: ${item.count}`;
                itemCard.appendChild(countSpan);
            }
            itemGrid.appendChild(itemCard);
        });
        outputDiv.appendChild(itemGrid);
    } else {
        const noItems = document.createElement('p');
        noItems.textContent = 'No loot tables found for this reference.';
        outputDiv.appendChild(noItems);
    }
}

// Initializing the viewer on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check if the necessary data is available
    if (typeof globalLootData !== 'undefined' && typeof globalLootTableCache !== 'undefined') {
        renderLootData(globalLootData, globalLootTableCache);
    } else {
        document.getElementById('output').innerHTML = '<p>Error: Loot table data not found. Please check your script tag.</p>';
        document.getElementById('searchInput').disabled = true;
    }

    // Attach event listener to the search bar
    document.getElementById('searchInput').addEventListener('input', function(e) {
        const searchTerm = e.target.value;
        renderLootData(globalLootData, globalLootTableCache, searchTerm);
    });
});