// src/components/common/CohortMap/CohortGeoMap.tsx

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MapPin, ChevronDown, Search, Maximize, Minimize, DownloadCloud } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { DashboardLearner } from '../../../types';

// ─── DATA UTILS ──────────────────────────────────────────────────────────────

export const sanitizeSACoords = (rawLat: any, rawLng: any): [number, number] | null => {
    let lat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
    let lng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

    if (lat > 10 && lng < 0) {
        const temp = lat; lat = lng; lng = temp;
    }

    if (lat > 20 && lat < 36) lat = -lat;

    if (lat >= -35.5 && lat <= -21.0 && lng >= 15.0 && lng <= 33.5) return [lat, lng];
    return null;
};

export const getLocationString = (l: DashboardLearner): string => {
    const demos = l.demographics || (l as any);
    const provName = String(demos.provinceName || demos.province || '').trim();
    const town = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();
    const muni = String(demos.localMunicipality || '').trim();

    if (town && muni) return `${town}, ${muni}, ${provName}`;
    if (town) return `${town}, ${provName}`;
    if (muni) return `${muni}, ${provName}`;
    return provName || 'Not specified';
};

export const extractGeoLevels = (learners: DashboardLearner[]) => {
    const provinces = new Set<string>();
    const districts = new Set<string>();
    const municipalities = new Set<string>();
    const cities = new Set<string>();
    let hasUnspecified = false;

    learners.forEach(l => {
        const demos = l.demographics || (l as any);
        const provName = String(demos.provinceName || demos.province || '').trim();
        if (provName) provinces.add(provName);

        const district = String(demos.districtOrMetro || demos.districtMunicipality || demos.district || '').trim();
        if (district) districts.add(district);

        const muni = String(demos.localMunicipality || demos.municipality || '').trim();
        if (muni) municipalities.add(muni);

        const city = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();
        if (city) cities.add(city);

        if (!provName && !district && !muni && !city) hasUnspecified = true;
    });

    return {
        provinces: Array.from(provinces).sort(),
        districts: Array.from(districts).sort(),
        municipalities: Array.from(municipalities).sort(),
        cities: Array.from(cities).sort(),
        hasUnspecified
    };
};

// ─── DYNAMIC GEOCODING HOOK ─────────────────────────────────────────────────

const useDynamicGeocoder = (locationsNeedingCoords: string[]) => {
    const [coordsCache, setCoordsCache] = useState<Record<string, [number, number]>>({});
    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (locationsNeedingCoords.length === 0 || isFetchingRef.current) return;

        const fetchCoords = async () => {
            isFetchingRef.current = true;
            const newCache = { ...coordsCache };

            for (const locName of locationsNeedingCoords) {
                if (newCache[locName]) continue;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locName + ", South Africa")}&format=json&limit=1`);
                    const data = await res.json();
                    if (data && data.length > 0 && data[0].lat && data[0].lon) {
                        newCache[locName] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                        setCoordsCache({ ...newCache });
                    }
                    await new Promise(resolve => setTimeout(resolve, 1100));
                } catch (e) {
                    console.error("Geocoding failed for", locName, e);
                }
            }
            isFetchingRef.current = false;
        };

        fetchCoords();
    }, [locationsNeedingCoords, coordsCache]);

    return coordsCache;
};

// ─── SEARCHABLE LOCATION DROPDOWN ───────────────────────────────────────────

const SearchableLocationDropdown: React.FC<{
    selected: string | null;
    onSelect: (loc: string | null) => void;
    geoLevels: {
        provinces: string[];
        districts: string[];
        municipalities: string[];
        cities: string[];
        hasUnspecified: boolean;
    };
}> = ({ selected, onSelect, geoLevels }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filterFn = (s: string) => s.toLowerCase().includes(search.toLowerCase());

    const filteredProvinces = geoLevels.provinces.filter(filterFn);
    const filteredDistricts = geoLevels.districts.filter(filterFn);
    const filteredMunicipalities = geoLevels.municipalities.filter(filterFn);
    const filteredCities = geoLevels.cities.filter(filterFn);

    const handleSelect = (loc: string | null) => {
        onSelect(loc);
        setSearch('');
        setIsOpen(false);
    };

    const hasResults = filteredProvinces.length > 0 || filteredDistricts.length > 0 || filteredMunicipalities.length > 0 || filteredCities.length > 0;
    const showUnspecified = geoLevels.hasUnspecified && search.toLowerCase().includes('not');

    return (
        <div ref={ref} style={{ position: 'relative', zIndex: 1001 }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
                    color: 'var(--mlab-white)', fontFamily: 'var(--font-heading)', fontWeight: 700,
                    fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0, outline: 'none',
                    display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', minWidth: '240px'
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <MapPin size={14} />
                    {selected || 'All Locations'}
                </span>
                <ChevronDown size={14} style={{ flexShrink: 0 }} />
            </button>

            {isOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 1002 }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-bg)' }}>
                        <Search size={14} color="var(--mlab-grey)" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Search any location level..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}
                        />
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <div onClick={() => handleSelect(null)} style={{ padding: '8px 12px', cursor: 'pointer', background: !selected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: !selected ? 700 : 500, fontSize: '0.8rem' }} onMouseOver={(e) => e.currentTarget.style.background = !selected ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'} onMouseOut={(e) => e.currentTarget.style.background = !selected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}>
                            🌍 All Locations
                        </div>

                        {filteredProvinces.length > 0 && (
                            <>
                                <div style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>🏛️ Provinces ({filteredProvinces.length})</div>
                                {filteredProvinces.map(loc => (
                                    <div key={loc} onClick={() => handleSelect(loc)} style={{ padding: '8px 12px', cursor: 'pointer', background: selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === loc ? 700 : 500, fontSize: '0.8rem' }} onMouseOver={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'} onMouseOut={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}>{loc}</div>
                                ))}
                            </>
                        )}

                        {filteredDistricts.length > 0 && (
                            <>
                                <div style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>🏘️ Districts & Metros ({filteredDistricts.length})</div>
                                {filteredDistricts.map(loc => (
                                    <div key={loc} onClick={() => handleSelect(loc)} style={{ padding: '8px 12px', cursor: 'pointer', background: selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === loc ? 700 : 500, fontSize: '0.8rem' }} onMouseOver={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'} onMouseOut={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}>{loc}</div>
                                ))}
                            </>
                        )}

                        {filteredMunicipalities.length > 0 && (
                            <>
                                <div style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>🏢 Local Municipalities ({filteredMunicipalities.length})</div>
                                {filteredMunicipalities.map(loc => (
                                    <div key={loc} onClick={() => handleSelect(loc)} style={{ padding: '8px 12px', cursor: 'pointer', background: selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === loc ? 700 : 500, fontSize: '0.8rem' }} onMouseOver={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'} onMouseOut={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}>{loc}</div>
                                ))}
                            </>
                        )}

                        {filteredCities.length > 0 && (
                            <>
                                <div style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>🏙️ Cities & Towns ({filteredCities.length})</div>
                                {filteredCities.map(loc => (
                                    <div key={loc} onClick={() => handleSelect(loc)} style={{ padding: '8px 12px', cursor: 'pointer', background: selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === loc ? 700 : 500, fontSize: '0.8rem' }} onMouseOver={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'} onMouseOut={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}>{loc}</div>
                                ))}
                            </>
                        )}

                        {showUnspecified && (
                            <div onClick={() => handleSelect('Not specified')} style={{ padding: '8px 12px', cursor: 'pointer', background: selected === 'Not specified' ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === 'Not specified' ? 700 : 500, fontSize: '0.8rem' }}>
                                ❓ Not specified
                            </div>
                        )}

                        {!hasResults && !showUnspecified && (
                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>
                                No locations found matching "{search}"
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── 🚀 UPDATED MAP CONTROLLER WITH SMART DYNAMIC ZOOM ────────────────────────

const MapController: React.FC<{
    target: [number, number] | null;
    markers: { lat: number; lng: number }[];
    isFullscreen: boolean;
    targetZoom?: number;
}> = ({ target, markers, isFullscreen, targetZoom }) => {
    const map = useMap();

    useEffect(() => {
        if (target) {
            // 1. User explicitly selected a location -> Use the smart targetZoom
            map.flyTo(target, targetZoom || (isFullscreen ? 10 : 8), { duration: 1.2 });
        } else if (markers.length > 0) {
            // 2. Auto-fit to all currently filtered markers on the map
            const lats = markers.map(m => m.lat);
            const lngs = markers.map(m => m.lng);

            const southWest: [number, number] = [Math.min(...lats), Math.min(...lngs)];
            const northEast: [number, number] = [Math.max(...lats), Math.max(...lngs)];

            // If only one unique coordinate exists
            if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
                map.flyTo(southWest, isFullscreen ? 10 : 8, { duration: 1.2 });
            } else {
                // Smoothly draw a box around all points and zoom to fit with padding
                map.flyToBounds([southWest, northEast], {
                    padding: [40, 40],
                    duration: 1.2,
                    maxZoom: isFullscreen ? 10 : 8
                });
            }
        } else {
            // 3. Fallback: No markers match the filters -> Reset to SA overview
            map.flyTo([-28.4793, 24.6727], isFullscreen ? 6 : 5, { duration: 1.2 });
        }
    }, [target, markers, isFullscreen, targetZoom, map]);

    return null;
};

// ─── MAIN COHORT GEO MAP COMPONENT ───────────────────────────────────────────

export const CohortGeoMap: React.FC<{
    learners: DashboardLearner[];
    allLearners?: DashboardLearner[];
    selectedLocation: string | null;
    onSelectLocation: (loc: string | null) => void;
    isFullscreen: boolean;
    onToggleFullscreen: (isFs: boolean) => void;
    visibleGeoLevels?: string[];
    onExport?: () => void;
}> = ({ learners, allLearners, selectedLocation, onSelectLocation, isFullscreen, onToggleFullscreen, visibleGeoLevels = ['province', 'district', 'municipality', 'city'], onExport }) => {

    // Populate dropdowns with allLearners so options aren't lost when filtering
    const geoLevels = useMemo(() => extractGeoLevels(allLearners || learners), [allLearners, learners]);

    // Key used to force react-leaflet to redraw CircleMarkers on Granularity change
    const geoLevelDep = visibleGeoLevels.sort().join('-');

    const { locationStats, locationsNeedingCoords } = useMemo(() => {
        const stats = new Map<string, { latLngs: [number, number][]; count: number; name: string }>();

        learners.forEach(l => {
            const demos = l.demographics || (l as any);
            const validCoords = sanitizeSACoords(demos.lat, demos.lng);

            let groupName = 'Not specified';

            if (visibleGeoLevels.includes('city')) {
                const city = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();
                if (city) groupName = city;
            }
            if (groupName === 'Not specified' && visibleGeoLevels.includes('municipality')) {
                const muni = String(demos.localMunicipality || demos.municipality || '').trim();
                if (muni) groupName = muni;
            }
            if (groupName === 'Not specified' && visibleGeoLevels.includes('district')) {
                const district = String(demos.districtOrMetro || demos.districtMunicipality || demos.district || '').trim();
                if (district) groupName = district;
            }
            if (groupName === 'Not specified' && visibleGeoLevels.includes('province')) {
                const provName = String(demos.provinceName || demos.province || '').trim();
                if (provName) groupName = provName;
            }

            if (!stats.has(groupName)) stats.set(groupName, { latLngs: [], count: 0, name: groupName });

            const entry = stats.get(groupName)!;
            entry.count++;
            if (validCoords) entry.latLngs.push(validCoords);
        });

        const finalStats: { lat: number, lng: number, count: number, name: string }[] = [];
        const needingCoords: string[] = [];

        stats.forEach(stat => {
            if (stat.latLngs.length > 0) {
                const avgLat = stat.latLngs.reduce((sum, l) => sum + l[0], 0) / stat.latLngs.length;
                const avgLng = stat.latLngs.reduce((sum, l) => sum + l[1], 0) / stat.latLngs.length;
                finalStats.push({ lat: avgLat, lng: avgLng, count: stat.count, name: stat.name });
            } else {
                needingCoords.push(stat.name);
                finalStats.push({ lat: 0, lng: 0, count: stat.count, name: stat.name });
            }
        });

        return { locationStats: finalStats, locationsNeedingCoords: needingCoords };
    }, [learners, geoLevelDep]);

    const dynamicCoords = useDynamicGeocoder(locationsNeedingCoords);

    const finalLocationStats = useMemo(() => {
        return locationStats.map(stat => {
            if (stat.lat === 0 && stat.lng === 0 && dynamicCoords[stat.name]) {
                return { ...stat, lat: dynamicCoords[stat.name][0], lng: dynamicCoords[stat.name][1] };
            }
            return stat;
        }).filter(stat => stat.lat !== 0 && stat.lng !== 0);
    }, [locationStats, dynamicCoords]);

    const targetCoords = useMemo(() => {
        if (!selectedLocation) return null;
        const found = finalLocationStats.find(l => l.name === selectedLocation);
        return found ? [found.lat, found.lng] as [number, number] : null;
    }, [selectedLocation, finalLocationStats]);

    // 🚀 NEW: Calculate the perfect zoom level based on the geographic scale of the selection
    const idealZoom = useMemo(() => {
        if (!selectedLocation) return undefined;

        // Leaflet Zoom Guide: 6 = Country, 7 = Province, 9 = District, 10-11 = City
        if (geoLevels.provinces.includes(selectedLocation)) return isFullscreen ? 7 : 6;
        if (geoLevels.districts.includes(selectedLocation)) return isFullscreen ? 9 : 8;
        if (geoLevels.municipalities.includes(selectedLocation)) return isFullscreen ? 10 : 9;

        return isFullscreen ? 12 : 11; // Default to tight zoom for specific Cities/Towns
    }, [selectedLocation, geoLevels, isFullscreen]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--mlab-white)' }}>
            <div className="lfm-header" style={{ padding: isFullscreen ? '1rem 1.5rem' : '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={isFullscreen ? 20 : 16} />
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: isFullscreen ? '1.2rem' : '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Applicant Geo-Concentration {isFullscreen ? "(Fullscreen)" : ""}
                    </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <SearchableLocationDropdown
                        selected={selectedLocation}
                        onSelect={onSelectLocation}
                        geoLevels={geoLevels}
                    />

                    {isFullscreen && onExport && (
                        <button
                            onClick={onExport}
                            style={{
                                background: 'var(--mlab-green)',
                                color: 'var(--mlab-blue)',
                                border: 'none',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontWeight: 700,
                                fontFamily: 'var(--font-heading)',
                                textTransform: 'uppercase',
                                borderRadius: 0,
                                boxShadow: '0 4px 12px rgba(148,199,61,0.4)'
                            }}
                        >
                            <DownloadCloud size={16} /> Export Data
                        </button>
                    )}

                    {isFullscreen ? (
                        <button onClick={() => onToggleFullscreen(false)} style={{ background: 'var(--mlab-red)', color: 'white', border: 'none', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', borderRadius: 0, boxShadow: '0 4px 12px rgba(239,68,68,0.4)' }}>
                            <Minimize size={16} /> Exit Fullscreen
                        </button>
                    ) : (
                        <button onClick={() => onToggleFullscreen(true)} style={{ background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-blue)', borderRadius: 0 }} title="View Full Screen">
                            <Maximize size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div style={{ height: isFullscreen ? 'calc(100vh - 65px)' : '350px', width: '100%', position: 'relative', flex: isFullscreen ? 1 : 'none' }}>
                <MapContainer key={isFullscreen ? "fs" : "inline"} center={[-28.4793, 24.6727]} zoom={isFullscreen ? 6 : 5} style={{ height: '100%', width: '100%', zIndex: 1 }} zoomControl={false}>

                    {/* Free OpenStreetMap Tiles */}
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />

                    {isFullscreen && <ZoomControl position="bottomleft" />}

                    {/* 🚀 Pass the ideal zoom level down to the controller */}
                    <MapController
                        target={targetCoords}
                        markers={finalLocationStats}
                        isFullscreen={isFullscreen}
                        targetZoom={idealZoom}
                    />

                    {finalLocationStats.map((loc) => {
                        const isSelected = selectedLocation === loc.name;
                        return (
                            <CircleMarker
                                key={`${loc.name}-${geoLevelDep}`}
                                center={[loc.lat, loc.lng]}
                                radius={isSelected ? Math.max(12, Math.min(35, loc.count * 2.5)) : Math.max(8, Math.min(30, loc.count * 2))}
                                fillColor={isSelected ? "#2563eb" : "#22c55e"}
                                color={isSelected ? "#073f4e" : "#15803d"}
                                weight={isSelected ? 3 : 1}
                                opacity={0.9}
                                fillOpacity={isSelected ? 0.85 : 0.6}
                                eventHandlers={{ click: () => onSelectLocation(isSelected ? null : loc.name) }}
                            >
                                <LeafletTooltip>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', textAlign: 'center' }}>
                                        <strong>{loc.name}</strong><br />
                                        {loc.count} Learner{loc.count !== 1 ? 's' : ''}<br />
                                        <span style={{ fontSize: '0.7rem', color: isSelected ? '#dc2626' : '#2563eb', fontWeight: 700 }}>{isSelected ? 'Click to clear' : 'Click to filter'}</span>
                                    </div>
                                </LeafletTooltip>
                            </CircleMarker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
};

