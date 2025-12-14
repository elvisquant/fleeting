// app/static/js/vehicles.js

// Global State for this module
let allVehicles = [];
let vehicleOptions = {};
let vehicleEditId = null;

// === MAIN INITIALIZATION FUNCTION (Called by Router) ===
async function initVehicles() {
    console.log("Vehicles Module Initialized");
    
    // 1. Setup Search Listener
    const searchInput = document.getElementById('vehicleSearch');
    if(searchInput) {
        searchInput.addEventListener('input', renderVehiclesTable);
    }

    // 2. Load Data
    await loadVehiclesData();
}

// === DATA LOADING ===
async function loadVehiclesData() {
    const tbody = document.getElementById('vehiclesBody');
    if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">Loading data...</td></tr>`;

    // Fetch dropdowns if empty
    if(Object.keys(vehicleOptions).length === 0) {
        await fetchVehicleDropdowns();
    }

    // Fetch Vehicles
    // Using the global fetchWithAuth defined in router.js
    const data = await window.fetchWithAuth('/vehicles/?limit=1000');
    
    if(data) {
        allVehicles = data;
        renderVehiclesTable();
    } else {
        if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error loading vehicles.</td></tr>`;
    }
}

async function fetchVehicleDropdowns() {
    try {
        const [makes, models, types, trans, fuels] = await Promise.all([
            window.fetchWithAuth('/vehicle-makes/?limit=200'),
            window.fetchWithAuth('/vehicle-models/?limit=1000'),
            window.fetchWithAuth('/vehicle-types/?limit=200'),
            window.fetchWithAuth('/vehicle-transmissions/?limit=200'),
            window.fetchWithAuth('/fuel-types/?limit=200')
        ]);
        vehicleOptions = { makes, models, types, trans, fuels };
    } catch (e) {
        console.error("Error loading dropdowns", e);
    }
}

// === RENDERING ===
function renderVehiclesTable() {
    const tbody = document.getElementById('vehiclesBody');
    if(!tbody) return;

    const searchInput = document.getElementById('vehicleSearch');
    const search = searchInput ? searchInput.value.toLowerCase() : "";
    
    // Filter logic
    let filtered = allVehicles.filter(v => 
        (v.plate_number && v.plate_number.toLowerCase().includes(search)) ||
        (v.vin && v.vin.toLowerCase().includes(search)) ||
        (getOptionName(vehicleOptions.makes, v.make).toLowerCase().includes(search))
    );

    const countSpan = document.getElementById('vehiclesCount');
    if(countSpan) countSpan.innerText = `Showing ${filtered.length} records`;

    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No vehicles found.</td></tr>`;
        return;
    }

    // Generate Rows
    tbody.innerHTML = filtered.map(v => {
        const make = getOptionName(vehicleOptions.makes, v.make);
        const model = getOptionName(vehicleOptions.models, v.model);
        const statusClass = getStatusClass(v.status);
        const purchaseDate = v.purchase_date ? new Date(v.purchase_date).toLocaleDateString() : 'N/A';
        
        return `
            <tr class="hover:bg-white/5 transition group border-b border-slate-700/30">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <i data-lucide="car" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <div class="font-medium text-white">${make} ${model}</div>
                            <div class="text-xs text-slate-500">ID: ${v.id}</div>
                        </div>
                    </div>
                </td>
                <td class="p-4 font-mono text-slate-300">${v.plate_number}<br><span class="text-xs text-slate-500">${v.vin}</span></td>
                <td class="p-4 text-slate-400">${v.year}</td>
                <td class="p-4 text-slate-400">${v.mileage ? v.mileage.toLocaleString() : 0} km</td>
                <td class="p-4"><span class="px-2 py-1 rounded-full text-xs font-medium border ${statusClass}">${v.status ? v.status.replace('_', ' ') : 'N/A'}</span></td>
                <td class="p-4 text-slate-400">${purchaseDate}</td>
                <td class="p-4 text-right">
                    <div class="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                        <button onclick="viewVehicle(${v.id})" class="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>
                        <button onclick="openAddVehicleModal(${v.id})" class="p-2 hover:bg-yellow-500/20 text-yellow-400 rounded-lg transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                        <button onclick="deleteVehicle(${v.id})" class="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === FORM & MODAL LOGIC ===

// Used for both Adding (id=null) and Editing (id=123)
function openAddVehicleModal(id = null) {
    vehicleEditId = id;
    const form = document.getElementById('vehicleForm');
    if(form) form.reset();
    
    const title = document.getElementById('vehicleModalTitle');
    
    populateFormDropdowns();
    
    if(id) {
        if(title) title.innerText = "Edit Vehicle";
        const v = allVehicles.find(x => x.id === id);
        if(v) fillVehicleForm(v);
    } else {
        if(title) title.innerText = "Add New Vehicle";
    }

    document.getElementById('vehicleModal').classList.remove('hidden');
}

function fillVehicleForm(v) {
    // Helper to safely set value
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.value = val;
    };

    setVal('vehicle_make_form', v.make);
    setVal('vehicle_model_form', v.model);
    setVal('vehicle_year_form', v.year);
    setVal('vehicle_plate_number_form', v.plate_number);
    setVal('vehicle_vin_form', v.vin);
    setVal('vehicle_color_form', v.color);
    setVal('vehicle_type_form', v.vehicle_type);
    setVal('vehicle_mileage_form', v.mileage);
    setVal('vehicle_engine_size_form', v.engine_size);
    setVal('vehicle_transmission_form', v.vehicle_transmission);
    setVal('vehicle_fuel_type_form', v.vehicle_fuel_type);
    setVal('vehicle_purchase_price_form', v.purchase_price);
    if(v.purchase_date) setVal('vehicle_purchase_date_form', v.purchase_date.split('T')[0]);
}

function closeVehicleModal() {
    document.getElementById('vehicleModal').classList.add('hidden');
}

async function submitVehicleForm() {
    // Helper to get value safely
    const getVal = (id) => document.getElementById(id).value;
    const getInt = (id) => parseInt(document.getElementById(id).value) || 0;
    const getFloat = (id) => parseFloat(document.getElementById(id).value) || 0.0;

    const formData = {
        make: getInt('vehicle_make_form'),
        model: getInt('vehicle_model_form'),
        year: getInt('vehicle_year_form'),
        plate_number: getVal('vehicle_plate_number_form'),
        vin: getVal('vehicle_vin_form'),
        color: getVal('vehicle_color_form'),
        vehicle_type: getInt('vehicle_type_form'),
        mileage: getFloat('vehicle_mileage_form'),
        engine_size: getFloat('vehicle_engine_size_form'),
        vehicle_transmission: getInt('vehicle_transmission_form'),
        vehicle_fuel_type: getInt('vehicle_fuel_type_form'),
        purchase_price: getFloat('vehicle_purchase_price_form'),
        purchase_date: new Date(getVal('vehicle_purchase_date_form')).toISOString()
    };

    let result;
    if(vehicleEditId) {
        result = await window.fetchWithAuth(`/vehicles/${vehicleEditId}`, 'PUT', formData);
    } else {
        result = await window.fetchWithAuth('/vehicles/', 'POST', formData);
    }

    if(result) {
        closeVehicleModal();
        await loadVehiclesData(); // Refresh list
    }
}

async function deleteVehicle(id) {
    if(confirm("Are you sure you want to delete this vehicle? This cannot be undone.")) {
        const result = await window.fetchWithAuth(`/vehicles/${id}`, 'DELETE');
        if(result) await loadVehiclesData();
    }
}

function viewVehicle(id) {
    const v = allVehicles.find(x => x.id === id);
    if(!v) return;
    
    const content = document.getElementById('viewVehicleContent');
    const make = getOptionName(vehicleOptions.makes, v.make);
    const model = getOptionName(vehicleOptions.models, v.model);
    
    content.innerHTML = `
        <div class="grid grid-cols-2 gap-4 text-sm text-slate-300">
            <div class="col-span-2 flex items-center gap-4 mb-4 pb-4 border-b border-white/10">
                <div class="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center text-white"><i data-lucide="car" class="w-8 h-8"></i></div>
                <div>
                    <h4 class="text-xl font-bold text-white">${make} ${model} ${v.year}</h4>
                    <p class="text-slate-400">Plate: ${v.plate_number} | VIN: ${v.vin}</p>
                </div>
            </div>
            <div><label class="text-xs text-slate-500 block">Status</label><span class="text-white">${v.status}</span></div>
            <div><label class="text-xs text-slate-500 block">Mileage</label><span class="text-white">${v.mileage} km</span></div>
            <div><label class="text-xs text-slate-500 block">Color</label><span class="text-white">${v.color}</span></div>
            <div><label class="text-xs text-slate-500 block">Engine</label><span class="text-white">${v.engine_size}L</span></div>
            <div><label class="text-xs text-slate-500 block">Price</label><span class="text-white">$${v.purchase_price}</span></div>
            <div><label class="text-xs text-slate-500 block">Date</label><span class="text-white">${new Date(v.purchase_date).toLocaleDateString()}</span></div>
        </div>
    `;
    
    const modal = document.getElementById('viewVehicleModal');
    if(modal) modal.classList.remove('hidden');
}

// === UTILS ===
function populateFormDropdowns() {
    populateSelect('vehicle_make_form', vehicleOptions.makes, 'vehicle_make');
    populateSelect('vehicle_model_form', vehicleOptions.models, 'vehicle_model');
    populateSelect('vehicle_type_form', vehicleOptions.types, 'vehicle_type');
    populateSelect('vehicle_transmission_form', vehicleOptions.trans, 'vehicle_transmission');
    populateSelect('vehicle_fuel_type_form', vehicleOptions.fuels, 'fuel_type');
}

function populateSelect(id, data, labelKey) {
    const el = document.getElementById(id);
    if(!el || !data) return;
    el.innerHTML = `<option value="">Select...</option>` + 
                   data.map(item => `<option value="${item.id}">${item[labelKey] || item.id}</option>`).join('');
}

function getOptionName(list, id) {
    if(!list) return id;
    const found = list.find(i => i.id === id);
    if(found) return found.vehicle_make || found.vehicle_model || found.vehicle_type || found.vehicle_transmission || found.fuel_type || id;
    return id;
}

function getStatusClass(status) {
    const map = {
        'available': 'bg-green-500/10 text-green-400 border-green-500/20',
        'in_use': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        'in_repair': 'bg-red-500/10 text-red-400 border-red-500/20',
        'sold': 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    };
    return map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}