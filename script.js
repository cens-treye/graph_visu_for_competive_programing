document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const container = document.getElementById('mynetwork');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const resetBtn = document.getElementById('reset-btn');
    const addNodeBtn = document.getElementById('add-node-btn');
    const indexingBtn = document.getElementById('indexing-btn');
    const setRootBtn = document.getElementById('set-root-btn');
    const ioTextarea = document.getElementById('io-textarea');
    const directedCheckbox = document.getElementById('directed-checkbox');
    const weightedCheckbox = document.getElementById('weighted-checkbox');
    const importTypeSelect = document.getElementById('import-type');
    const graphTypeSelect = document.getElementById('graph-type');
    const rootControl = document.getElementById('root-control');
    const rootInput = document.getElementById('root-input');
    const genBtn = document.getElementById('gen-btn');
    const numNodesInput = document.getElementById('num-nodes');
    const numEdgesInput = document.getElementById('num-edges');

    // Context Menus
    const nodeContextMenu = document.getElementById('node-context-menu');
    const edgeContextMenu = document.getElementById('edge-context-menu');

    // Modal
    const helpButton = document.getElementById('help-button');
    const helpModal = document.getElementById('help-modal');
    const closeHelpModal = document.getElementById('close-help-modal');

    // 定数
    const MAX_NODES = 100; // 最大ノード数

    // --- 状態管理 ---
    let state = {
        isZeroIndexed: true,
        isDirected: false,
        isWeighted: false,
        graphMode: 'normal', // 'normal' or 'tree'
        edgeAddition: { active: false, fromNode: null },
        contextTarget: { type: null, id: null },
    };

    // --- vis.jsの初期化 ---
    const nodes = new vis.DataSet([]);
    const edges = new vis.DataSet([]);
    const data = { nodes: nodes, edges: edges };
    const options_normal_layout = {
        layout: {
            hierarchical: {
                enabled: false
            }
        },
    }
    const options_tree_layout = {
        layout: {
            hierarchical: {
                direction: 'UD',
                sortMethod: 'directed',
                shakeTowards: 'roots',
            },
        },
    }
    const options = {
        interaction: {
            navigationButtons: true,
            keyboard: false,
        },
        physics: {
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -50,
                centralGravity: 0.01,
                springLength: 100,
                springConstant: 0.08,
            },
            stabilization: { iterations: 150 },
        },
        nodes: {
            shape: 'ellipse',
            size: 16,
            font: {
                size: 14,
                color: '#111',
            },
            borderWidth: 2,
        },
        edges: {
            width: 2,
            font: {
                align: 'middle',
            },
        },
        manipulation: {
            enabled: false, // Use custom context menus instead
        },
        ...options_normal_layout,
    };
    const network = new vis.Network(container, data, options);

    // --- イベントリスナー ---

    // ヘルプモーダル
    helpButton.addEventListener('click', () => helpModal.classList.remove('hidden'));
    closeHelpModal.addEventListener('click', () => helpModal.classList.add('hidden'));
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.add('hidden');
        }
    });

    // インプット
    ioTextarea.addEventListener('input', () => {
        // 入力時にImportする
        importGraph();
    });

    // コントロール
    importBtn.addEventListener('click', importGraph);
    exportBtn.addEventListener('click', exportGraph);
    resetBtn.addEventListener('click', resetGraph);
    addNodeBtn.addEventListener('click', addNode);
    indexingBtn.addEventListener('click', toggleIndexing);
    directedCheckbox.addEventListener('change', updateGraphOptions);
    weightedCheckbox.addEventListener('change', (e) => {
        state.isWeighted = e.target.checked;
    });
    graphTypeSelect.addEventListener('change', (e) => {
        state.graphMode = e.target.value;
        rootControl.classList.toggle('hidden', state.graphMode !== 'tree');
        if (state.graphMode === 'tree') {
            directedCheckbox.checked = true;
        } else {
            resetNodeColors();
        }
        console.log(state.graphMode);
        updateGraphOptions();
        if (state.graphMode === 'tree') {
            colorTreeByRoot();
        }
    });
    setRootBtn.addEventListener('click', colorTreeByRoot);

    // ネットワークイベント
    network.on('oncontext', handleRightClick);
    network.on('click', handleClick);
    container.addEventListener('contextmenu', e => e.preventDefault());

    // コンテキストメニューアイテムのイベント
    document.getElementById('delete-node-menu-btn').addEventListener('click', deleteNode);
    document.getElementById('add-edge-menu-btn').addEventListener('click', startAddEdgeMode);
    document.getElementById('delete-edge-menu-btn').addEventListener('click', deleteEdge);
    document.getElementById('change-weight-menu-btn').addEventListener('click', changeEdgeWeight);
    document.getElementById('reverse-edge-menu-btn').addEventListener('click', reverseEdge);

    // ランダム生成ボタン
    genBtn.addEventListener('click', () => {
        const numNodes = Math.min(Math.max(parseInt(numNodesInput.value), 1), MAX_NODES);
        const maxEdges = state.isDirected ? numNodes * (numNodes - 1) : (numNodes * (numNodes - 1)) / 2;
        const numEdges = Math.min(Math.max(parseInt(numEdgesInput.value), 0), maxEdges);

        resetGraph();

        // ノード追加
        const newNodes = [];
        const offset = state.isZeroIndexed ? 0 : 1;
        for (let i = 0; i < numNodes; i++) {
            newNodes.push({ id: i + offset, label: String(i + offset) });
        }
        nodes.add(newNodes);

        // 辺追加
        const newEdges = new Set();
        // なるべく連結にするため、まずは木を生成
        const nodeIds = newNodes.map(n => n.id);
        const shuffled = nodeIds.slice().sort(() => Math.random() - 0.5);
        for (let i = 1; i < shuffled.length; i++) {
            const from = shuffled[i];
            const to = shuffled[Math.floor(Math.random() * i)];
            newEdges.add(state.isDirected ? `${from},${to}` : (from < to ? `${from},${to}` : `${to},${from}`));
        }
        // 残りの辺をランダムに追加
        while (newEdges.size < numEdges) {
            let from = nodeIds[Math.floor(Math.random() * nodeIds.length)];
            let to = nodeIds[Math.floor(Math.random() * nodeIds.length)];
            if (from === to) continue; // 自己ループ禁止
            if (!state.isDirected && from > to) [from, to] = [to, from]; // 無向グラフなら順序を固定
            newEdges.add(`${from},${to}`);
        }

        // 辺が多すぎる場合は削減
        while (newEdges.size > numEdges) {
            const arr = Array.from(newEdges);
            const toDelete = arr[Math.floor(Math.random() * arr.length)];
            newEdges.delete(toDelete);
        }

        const edgeArray = [];
        newEdges.forEach(key => {
            const [from, to] = key.split(',').map(Number);
            const edge = { from: from, to: to };
            if (state.isWeighted) {
                edge.label = String(Math.floor(Math.random() * 10) + 1); // 1～10の重み
            }
            edgeArray.push(edge);
        });
        edges.add(edgeArray);

        network.fit();

        // Treeモードなら色付け
        if (state.graphMode === 'tree') {
            colorTreeByRoot();
        }
    });

    // --- 関数定義 ---
    function updateGraphOptions() {
        state.isDirected = directedCheckbox.checked;
        state.isWeighted = weightedCheckbox.checked;
        state.graphMode = graphTypeSelect.value;
        rootControl.classList.toggle('hidden', state.graphMode !== 'tree');

        let newOptions = {
            edges: {
                arrows: {
                    to: { enabled: state.isDirected, scaleFactor: 1, type: 'arrow' }
                }
            },
        };
        if (state.graphMode === 'normal') {
            newOptions = {
                ...newOptions,
                ...options_normal_layout,
            };
        } else {
            newOptions = {
                ...newOptions,
                ...options_tree_layout,
            };
        }
        network.setOptions(newOptions);
    }

    function toggleIndexing() {
        state.isZeroIndexed = !state.isZeroIndexed;
        indexingBtn.textContent = state.isZeroIndexed ? '0-indexed' : '1-indexed';
        indexingBtn.classList.toggle('bg-gray-500', state.isZeroIndexed);
        indexingBtn.classList.toggle('hover:bg-gray-600', state.isZeroIndexed);
        indexingBtn.classList.toggle('bg-blue-500', !state.isZeroIndexed);
        indexingBtn.classList.toggle('hover:bg-blue-600', !state.isZeroIndexed);
    }

    function resetGraph() {
        nodes.clear();
        edges.clear();
        ioTextarea.value = '';
    }

    function addNode() {
        const newId = nodes.length > 0 ? Math.max(...nodes.getIds()) + 1 : (state.isZeroIndexed ? 0 : 1);
        nodes.add({ id: newId, label: String(newId) });
    }

    function hideContextMenus() {
        nodeContextMenu.style.display = 'none';
        edgeContextMenu.style.display = 'none';
    }

    function handleRightClick(params) {
        params.event.preventDefault();
        hideContextMenus();

        const nodeId = network.getNodeAt(params.pointer.DOM);
        const edgeId = network.getEdgeAt(params.pointer.DOM);

        if (nodeId !== undefined) {
            state.contextTarget = { type: 'node', id: nodeId };
            nodeContextMenu.style.left = `${params.event.pageX}px`;
            nodeContextMenu.style.top = `${params.event.pageY}px`;
            nodeContextMenu.style.display = 'block';
        } else if (edgeId !== undefined) {
            state.contextTarget = { type: 'edge', id: edgeId };
            edgeContextMenu.style.left = `${params.event.pageX}px`;
            edgeContextMenu.style.top = `${params.event.pageY}px`;
            edgeContextMenu.style.display = 'block';
        } else {
            state.contextTarget = { type: null, id: null };
        }
    }

    function handleClick(params) {
        if (state.edgeAddition.active) {
            const toNode = network.getNodeAt(params.pointer.DOM);
            if (toNode !== undefined && toNode !== state.edgeAddition.fromNode) {
                const newEdge = { from: state.edgeAddition.fromNode, to: toNode };
                if (state.isWeighted) {
                    const weight = prompt("Enter weight for the new edge:", "1");
                    if (weight !== null) {
                        newEdge.label = weight;
                    }
                }
                edges.add(newEdge);
            }
            // End edge addition mode
            state.edgeAddition.active = false;
            state.edgeAddition.fromNode = null;
            container.style.cursor = 'default';
        }
        hideContextMenus();
    }

    // --- コンテキストメニューのアクション ---
    function deleteNode() {
        if (state.contextTarget.type === 'node') {
            nodes.remove({ id: state.contextTarget.id });
        }
        hideContextMenus();
    }

    function startAddEdgeMode() {
        if (state.contextTarget.type === 'node') {
            state.edgeAddition.active = true;
            state.edgeAddition.fromNode = state.contextTarget.id;
            container.style.cursor = 'crosshair';
        }
        hideContextMenus();
    }

    function deleteEdge() {
        if (state.contextTarget.type === 'edge') {
            edges.remove({ id: state.contextTarget.id });
        }
        hideContextMenus();
    }

    function changeEdgeWeight() {
        if (state.contextTarget.type === 'edge') {
            const currentEdge = edges.get(state.contextTarget.id);
            const newWeight = prompt("Enter new weight:", currentEdge.label || "1");
            if (newWeight !== null) {
                edges.update({ id: state.contextTarget.id, label: newWeight });
            }
        }
        hideContextMenus();
    }

    function reverseEdge() {
        if (state.contextTarget.type === 'edge') {
            const edge = edges.get(state.contextTarget.id);
            edges.update({ id: edge.id, from: edge.to, to: edge.from });
        }
        hideContextMenus();
    }

    // --- インポート/エクスポート ---
    function importGraph() {
        nodes.clear();
        edges.clear();
        // --- インデックス自動判定 ---
        const text = ioTextarea.value.trim();
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return;

        // 1行目からNを取得
        let N = null;
        if (importTypeSelect.value === 'edge-list') {
            const [N_str] = lines[0].split(/\s+/);
            N = parseInt(N_str);
        } else if (importTypeSelect.value === 'adjacency-list' || importTypeSelect.value === 'adjacency-matrix') {
            N = parseInt(lines[0]);
        }

        // Nの上限を設定
        if (isNaN(N) || N <= 0 || N > MAX_NODES) {
            alert("Invalid number of nodes (N). Please ensure 1 <= N <= " + MAX_NODES);
            return;
        }

        // 辺の頂点番号を抽出
        let hasZero = false, hasN = false;
        if (importTypeSelect.value === 'edge-list') {
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(/\s+/);
                const u = parseInt(parts[0]);
                const v = parseInt(parts[1]);
                if (u === 0 || v === 0) hasZero = true;
                if (u === N || v === N) hasN = true;
            }
        } else if (importTypeSelect.value === 'adjacency-list') {
            for (let i = 1; i <= N; i++) {
                const parts = lines[i].split(/\s+/).map(Number);
                if (parts.includes(0)) hasZero = true;
                if (parts.includes(N)) hasN = true;
            }
        } else if (importTypeSelect.value === 'adjacency-matrix') {
            // 頂点番号は0～N-1 or 1～N
            // 行番号・列番号で判定
            for (let i = 0; i < N; i++) {
                if (i === 0) hasZero = true;
                if (i === N) hasN = true;
            }
        }

        // 判定してstateとボタン表示を更新
        if (hasZero) {
            state.isZeroIndexed = true;
        } else if (hasN) {
            state.isZeroIndexed = false;
        }
        indexingBtn.textContent = state.isZeroIndexed ? '0-indexed' : '1-indexed';
        indexingBtn.classList.toggle('bg-gray-500', state.isZeroIndexed);
        indexingBtn.classList.toggle('hover:bg-gray-600', state.isZeroIndexed);
        indexingBtn.classList.toggle('bg-blue-500', !state.isZeroIndexed);
        indexingBtn.classList.toggle('hover:bg-blue-600', !state.isZeroIndexed);

        updateGraphOptions();

        try {
            const importFunc = {
                'edge-list': parseEdgeList,
                'adjacency-list': parseAdjacencyList,
                'adjacency-matrix': parseAdjacencyMatrix,
            }[importTypeSelect.value];

            importFunc(lines);
        } catch (e) {
            alert("Error parsing input: " + e.message);
            nodes.clear();
            edges.clear();
        }
        network.fit();

        // Treeモードなら色付け
        if (state.graphMode === 'tree') {
            colorTreeByRoot();
        }
    }

    function parseEdgeList(lines) {
        const [N_str, M_str] = lines[0].split(/\s+/);
        const N = parseInt(N_str);

        const offset = state.isZeroIndexed ? 0 : 1;
        const newNodes = [];
        for (let i = 0; i < N; i++) {
            newNodes.push({ id: i + offset, label: String(i + offset) });
        }
        nodes.add(newNodes);

        const newEdges = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            const u = parseInt(parts[0]);
            const v = parseInt(parts[1]);
            const edge = { from: u, to: v };
            if (state.isWeighted && parts.length > 2) {
                edge.label = parts[2];
            }
            newEdges.push(edge);
        }
        edges.add(newEdges);
    }

    function parseAdjacencyList(lines) {
        const N = parseInt(lines[0]);
        const offset = state.isZeroIndexed ? 0 : 1;
        const newNodes = [];
        for (let i = 0; i < N; i++) {
            newNodes.push({ id: i + offset, label: String(i + offset) });
        }
        nodes.add(newNodes);

        const newEdges = [];
        for (let i = 0; i < N; i++) {
            const u = i + offset;
            const parts = lines[i + 1].split(/\s+/).filter(p => p !== '');
            for (const part of parts) {
                const v = parseInt(part);
                newEdges.push({ from: u, to: v });
            }
        }
        edges.add(newEdges);
    }

    function parseAdjacencyMatrix(lines) {
        const N = parseInt(lines[0]);
        const offset = state.isZeroIndexed ? 0 : 1;
        const newNodes = [];
        for (let i = 0; i < N; i++) {
            newNodes.push({ id: i + offset, label: String(i + offset) });
        }
        nodes.add(newNodes);

        const newEdges = [];
        for (let i = 0; i < N; i++) {
            const row = lines[i + 1].split(/\s+/);
            for (let j = 0; j < N; j++) {
                const val = parseInt(row[j]);
                if (val !== 0) {
                    const edge = { from: i + offset, to: j + offset };
                    if (state.isWeighted) {
                        edge.label = String(val);
                    }
                    newEdges.push(edge);
                }
            }
        }
        edges.add(newEdges);
    }

    function exportGraph() {
        const N = nodes.length;
        const M = edges.length;
        let output = `${N} ${M}\n`;

        edges.forEach(edge => {
            let line = `${edge.from} ${edge.to}`;
            if (state.isWeighted && edge.label) {
                line += ` ${edge.label}`;
            }
            output += line + '\n';
        });

        ioTextarea.value = output;
    }

    // --- Treeモード関連 ---
    function colorTreeByRoot() {
        if (state.graphMode !== 'tree') return;
        let rootId = parseInt(rootInput.value);

        if (nodes.get(rootId) === null) {
            rootId = get_central_node();
        }

        // 必ずDirected表示
        directedCheckbox.checked = true;
        updateGraphOptions();
        state.isDirected = true;

        // 1. BFSで親子関係構築
        const adj = new Map();
        nodes.getIds().forEach(id => adj.set(id, []));
        edges.forEach(edge => {
            adj.get(edge.from).push(edge.to);
            adj.get(edge.to).push(edge.from); // 無向として探索
        });

        const parent = new Map();
        const distances = new Map();
        const queue = [[rootId, 0]];
        const visited = new Set([rootId]);
        distances.set(rootId, 0);
        parent.set(rootId, null);

        let maxDist = 0;
        let head = 0;
        while (head < queue.length) {
            const [u, dist] = queue[head++];
            maxDist = Math.max(maxDist, dist);

            for (const v of adj.get(u)) {
                if (!visited.has(v)) {
                    visited.add(v);
                    distances.set(v, dist + 1);
                    parent.set(v, u);
                    queue.push([v, dist + 1]);
                }
            }
        }

        // 2. Directedな木構造の辺に再構成
        // 重み付きの場合は元の辺から重みを取得
        const newEdges = [];
        nodes.getIds().forEach(id => {
            const p = parent.get(id);
            if (p !== null) {
                // 元の辺を検索して重み取得
                let label = undefined;
                edges.forEach(edge => {
                    if ((edge.from === p && edge.to === id) || (edge.from === id && edge.to === p)) {
                        if (state.isWeighted && edge.label) label = edge.label;
                    }
                });
                const edgeObj = { from: p, to: id };
                if (label !== undefined) edgeObj.label = label;
                newEdges.push(edgeObj);
            }
        });
        edges.clear();
        edges.add(newEdges);

        // 3. 色付け
        const updatedNodes = [];
        nodes.forEach(node => {
            const dist = distances.get(node.id);
            let color = '#d1d5db'; // デフォルト色 (未到達)
            if (dist !== undefined) {
                if (dist === 0) {
                    color = '#ff7b7bff'; // rootは赤
                } else {
                    const hue = 120 + (dist / (maxDist || 1)) * 60;
                    color = `hsl(${hue}, 80%, 60%)`;
                }
            }
            updatedNodes.push({ id: node.id, color: { background: color, border: color } });
        });
        nodes.update(updatedNodes);
    }

    function get_central_node() {
        // 木の中心を求める
        // 木でないときは適当に0 or 1を返す
        if (nodes.length !== edges.length + 1) {
            return nodes.getIds()[0];
        }
        const adj = new Map();
        nodes.getIds().forEach(id => adj.set(id, []));
        edges.forEach(edge => {
            adj.get(edge.from).push(edge.to);
            adj.get(edge.to).push(edge.from);
        });

        let leaves = [];
        adj.forEach((neighbors, node) => {
            if (neighbors.length <= 1) {
                leaves.push(node);
            }
        });

        let remainingNodes = nodes.length;
        while (remainingNodes > 2) {
            const newLeaves = [];
            remainingNodes -= leaves.length;

            for (const leaf of leaves) {
                const neighbors = adj.get(leaf);
                for (const neighbor of neighbors) {
                    const nbrList = adj.get(neighbor);
                    nbrList.splice(nbrList.indexOf(leaf), 1);
                    if (nbrList.length === 1) {
                        newLeaves.push(neighbor);
                    }
                }
                adj.delete(leaf);
            }
            leaves = newLeaves;
        }

        return leaves.length > 0 ? leaves[0] : nodes.getIds()[0];
    }

    function resetNodeColors() {
        const updatedNodes = [];
        nodes.forEach(node => {
            updatedNodes.push({ id: node.id, color: null });
        });
        nodes.update(updatedNodes);
    }

    // 初期化
    updateGraphOptions();
    importGraph();
});
