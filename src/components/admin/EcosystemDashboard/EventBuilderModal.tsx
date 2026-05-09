// src/components/AdminPortal/EcosystemDashboard/EventBuilderModal.tsx

import React, { useState } from "react";
import {
    X, Save, Loader2, AlertCircle, Calendar,
    Settings, ListPlus, Plus, Trash2, Globe, Lock, Tag, Wifi
} from "lucide-react";
import Autocomplete from "react-google-autocomplete";
import { useToast } from "../../../components/common/Toast/Toast";
import { useStore } from "../../../store/useStore";
import type { ProgrammeTemplate } from "../../../types";
import type { EcosystemEvent, GuestFormCustomField, GuestIdRequirement } from "../../../types/ecosystem.types";

import "../../admin/LearnerFormModal/LearnerFormModal.css";

// ─── LOCAL DICTIONARY ───
const QCTO_PROVINCES = [
    { label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" },
    { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" },
    { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" },
    { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" },
    { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }
];

interface EventBuilderModalProps {
    event?: EcosystemEvent | null;
    programmes: ProgrammeTemplate[];
    onClose: () => void;
    onSave: (eventData: Partial<EcosystemEvent>) => Promise<void>;
}

export const EventBuilderModal: React.FC<EventBuilderModalProps> = ({
    event,
    programmes,
    onClose,
    onSave
}) => {
    const toast = useToast();
    const { settings, updateSettings } = useStore();

    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // ─── DYNAMIC EVENT TYPES LOGIC ───
    const defaultTypes = ["Hackathon", "Workshop", "Open Day", "Masterclass", "CodeTribe Bootcamp"];
    const savedTypes = (settings as any)?.ecosystem?.eventTypes || [];
    const availableEventTypes = Array.from(new Set([...defaultTypes, ...savedTypes]));

    const [eventType, setEventType] = useState((event as any)?.eventType || "");
    const [isOtherType, setIsOtherType] = useState(false);
    const [newEventType, setNewEventType] = useState("");

    const [wifiSsid, setWifiSsid] = useState((event?.settings as any)?.wifiSsid || "");
    const [wifiPassword, setWifiPassword] = useState((event?.settings as any)?.wifiPassword || "");

    // ─── CORE EVENT STATE ───
    const [eventName, setEventName] = useState(event?.eventName || "");

    // MULTI-DAY SUPPORT: Start Date & End Date
    const todayStr = new Date().toISOString().split("T")[0];
    const [startDate, setStartDate] = useState(event?.date ? event.date.split("T")[0] : todayStr);
    const [endDate, setEndDate] = useState((event as any)?.endDate ? (event as any).endDate.split("T")[0] : startDate);

    const [maxCapacity, setMaxCapacity] = useState<number>(event?.maxCapacity || 50);
    const [requireIdPassport, setRequireIdPassport] = useState<GuestIdRequirement>(event?.settings?.requireIdPassport || "optional");

    // ─── ROBUST LOCATION STATE ───
    const [location, setLocation] = useState(event?.location || ""); // Venue Name
    const [streetAddress, setStreetAddress] = useState((event as any)?.locationDetails?.streetAddress || "");
    const [city, setCity] = useState((event as any)?.locationDetails?.city || "");
    const [provinceCode, setProvinceCode] = useState((event as any)?.locationDetails?.provinceCode || "");
    const [postalCode, setPostalCode] = useState((event as any)?.locationDetails?.postalCode || "");
    const [lat, setLat] = useState<number>((event as any)?.locationDetails?.lat || 0);
    const [lng, setLng] = useState<number>((event as any)?.locationDetails?.lng || 0);

    // ─── CUSTOM FIELDS STATE ───
    const [customFields, setCustomFields] = useState<GuestFormCustomField[]>(event?.guestFormBlueprint || []);

    const addCustomField = () => {
        const newField: GuestFormCustomField = {
            id: `field_${Date.now()}`,
            label: "",
            type: "text",
            required: false,
            options: []
        };
        setCustomFields([...customFields, newField]);
    };

    const updateCustomField = (id: string, key: keyof GuestFormCustomField, value: any) => {
        setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
    };

    const removeCustomField = (id: string) => {
        setCustomFields(prev => prev.filter(f => f.id !== id));
    };

    const handlePlaceSelected = (place: any) => {
        if (place.geometry && place.geometry.location) {
            const newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            const newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
            setLat(newLat);
            setLng(newLng);
        }

        const addressComponents = place.address_components;
        const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

        const provString = getComp("administrative_area_level_1");
        const matchedProv = QCTO_PROVINCES.find(p => provString.includes(p.label))?.value || '';
        const townName = getComp("locality") || getComp("sublocality_level_1");
        const postal = getComp("postal_code");
        const formatted = place.formatted_address || "";

        setStreetAddress(formatted);
        setCity(townName);
        setProvinceCode(matchedProv);
        setPostalCode(postal);

        const venueName = place.name || formatted.split(',')[0];
        setLocation(venueName);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!eventName.trim() || !location.trim() || !streetAddress.trim()) {
            setErrorMessage("Event Name, Venue Name, and Street Address are required.");
            return;
        }

        // Validate Dates
        if (new Date(endDate) < new Date(startDate)) {
            setErrorMessage("The End Date cannot be before the Start Date.");
            return;
        }

        // Determine final Event Type
        let finalEventType = eventType;
        if (isOtherType && newEventType.trim()) {
            finalEventType = newEventType.trim();

            if (updateSettings) {
                const updatedTypes = Array.from(new Set([...savedTypes, finalEventType]));
                updateSettings({
                    ecosystem: {
                        ...((settings as any)?.ecosystem || {}),
                        eventTypes: updatedTypes
                    }
                }).catch(err => console.error("Failed to save new event type globally", err));
            }
        }

        if (!finalEventType) {
            setErrorMessage("Please select or enter an Event Programme / Type.");
            return;
        }

        // Validate Dropdowns have options
        const invalidDropdown = customFields.find(f => f.type === 'dropdown' && (!f.options || f.options.join('').trim() === ''));
        if (invalidDropdown) {
            setErrorMessage(`Please provide options for the dropdown question: "${invalidDropdown.label || 'Untitled'}"`);
            return;
        }

        setIsSaving(true);

        const eventPayload: Partial<EcosystemEvent> = {
            eventName,
            location,
            date: new Date(startDate).toISOString(),
            endDate: new Date(endDate).toISOString(),
            maxCapacity,
            eventType: finalEventType,

            locationDetails: {
                lat,
                lng,
                streetAddress,
                city,
                provinceCode,
                postalCode
            } as any,

            settings: {
                requireIdPassport,
                wifiSsid,
                wifiPassword,
                allowedProgrammes: []
            } as any,

            guestFormBlueprint: customFields
                .filter(f => f.label.trim() !== "")
                .map(f => ({
                    ...f,
                    options: f.type === 'dropdown' && f.options
                        ? f.options.map(opt => opt.trim()).filter(opt => opt !== "")
                        : []
                }))
        };

        try {
            await onSave(eventPayload);
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to save event.");
            setIsSaving(false);
        }
    };

    return (
        <div className="lfm-overlay" onClick={onClose}>
            <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "1100px", width: "95vw" }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Calendar size={18} /> {event ? "Edit Ecosystem Event" : "Create Ecosystem Event"}
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                    <div className="lfm-body" style={{ padding: "1.5rem" }}>

                        {errorMessage && (
                            <div className="lfm-error-banner" style={{ marginBottom: "1rem" }}><AlertCircle size={16} /><span>{errorMessage}</span></div>
                        )}

                        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                            {/* ─── LEFT COLUMN: CORE SETTINGS ─── */}
                            <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                                <div>
                                    <div className="lfm-section-hdr"><Globe size={13} /> Event Core Details</div>
                                    <div className="lfm-grid">
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Event Name *</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                required
                                                placeholder="e.g. CodeTribe Hackathon 2026"
                                                value={eventName}
                                                onChange={(e) => setEventName(e.target.value)}
                                            />
                                        </div>

                                        <div className="lfm-fg lfm-fg--full">
                                            <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                <Tag size={12} /> Programme / Event Type *
                                            </label>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <select
                                                    className="lfm-input lfm-select"
                                                    value={isOtherType ? "other" : eventType}
                                                    onChange={(e) => {
                                                        if (e.target.value === "other") {
                                                            setIsOtherType(true);
                                                            setEventType("");
                                                        } else {
                                                            setIsOtherType(false);
                                                            setEventType(e.target.value);
                                                        }
                                                    }}
                                                    style={{ flex: isOtherType ? 1 : 2 }}
                                                    required={!isOtherType}
                                                >
                                                    <option value="">-- Select Programme --</option>
                                                    {availableEventTypes.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                    <option value="other">Add Other (Save to List)...</option>
                                                </select>

                                                {isOtherType && (
                                                    <input
                                                        className="lfm-input"
                                                        type="text"
                                                        required
                                                        placeholder="Type new category..."
                                                        value={newEventType}
                                                        onChange={(e) => setNewEventType(e.target.value)}
                                                        style={{ flex: 2, border: '1px solid var(--mlab-green)', background: 'var(--mlab-green-bg)' }}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="lfm-fg">
                                            <label>Start Date *</label>
                                            <input
                                                className="lfm-input"
                                                type="date"
                                                required
                                                value={startDate}
                                                onChange={(e) => {
                                                    setStartDate(e.target.value);
                                                    // Auto-advance end date if it's currently before the new start date
                                                    if (new Date(endDate) < new Date(e.target.value)) {
                                                        setEndDate(e.target.value);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="lfm-fg">
                                            <label>End Date *</label>
                                            <input
                                                className="lfm-input"
                                                type="date"
                                                required
                                                value={endDate}
                                                min={startDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                            />
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Max Capacity *</label>
                                            <input
                                                className="lfm-input"
                                                type="number"
                                                required
                                                min={1}
                                                value={maxCapacity}
                                                onChange={(e) => setMaxCapacity(parseInt(e.target.value) || 50)}
                                            />
                                        </div>

                                        <div className="lfm-fg lfm-fg--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', marginBottom: '6px' }}>
                                                <Globe size={13} /> Secure Google Maps Search
                                            </label>
                                            <Autocomplete
                                                apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                                onPlaceSelected={handlePlaceSelected}
                                                options={{ types: [], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
                                                className="lfm-input"
                                                placeholder="Search for venue to map coordinates and auto-fill..."
                                            />
                                            {lat !== 0 && (
                                                <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#10b981', display: 'flex', gap: '8px' }}>
                                                    <span><strong>Lat:</strong> {lat.toFixed(6)}</span>
                                                    <span><strong>Lng:</strong> {lng.toFixed(6)}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Venue Name *</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                required
                                                placeholder="e.g. Pretoria Hub"
                                                value={location}
                                                onChange={(e) => setLocation(e.target.value)}
                                            />
                                        </div>
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Street Address *</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                required
                                                placeholder="e.g. 123 Innovation Drive..."
                                                value={streetAddress}
                                                onChange={(e) => setStreetAddress(e.target.value)}
                                            />
                                        </div>
                                        <div className="lfm-fg">
                                            <label>City / Town</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                value={city}
                                                onChange={(e) => setCity(e.target.value)}
                                            />
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Province</label>
                                            <select
                                                className="lfm-input lfm-select"
                                                value={provinceCode}
                                                onChange={(e) => setProvinceCode(e.target.value)}
                                            >
                                                <option value="">Select Province...</option>
                                                {QCTO_PROVINCES.map(p => (
                                                    <option key={p.value} value={p.value}>{p.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Postal Code</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                value={postalCode}
                                                onChange={(e) => setPostalCode(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="lfm-section-hdr"><Wifi size={13} /> Guest WiFi Credentials</div>
                                    <div className="lfm-grid">
                                        <div className="lfm-fg">
                                            <label>WiFi SSID</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                placeholder="e.g. mLab_Guest"
                                                value={wifiSsid}
                                                onChange={(e) => setWifiSsid(e.target.value)}
                                            />
                                        </div>
                                        <div className="lfm-fg">
                                            <label>WiFi Password</label>
                                            <input
                                                className="lfm-input"
                                                type="text"
                                                placeholder="Shared on success"
                                                value={wifiPassword}
                                                onChange={(e) => setWifiPassword(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="lfm-section-hdr"><Settings size={13} /> Check-In Requirements</div>
                                    <div className="lfm-flags-panel">
                                        <div className="lfm-fg">
                                            <label>ID / Passport Requirement</label>
                                            <select
                                                className="lfm-input lfm-select"
                                                value={requireIdPassport}
                                                onChange={(e) => setRequireIdPassport(e.target.value as GuestIdRequirement)}
                                            >
                                                <option value="hidden">Hidden (Do not ask for ID)</option>
                                                <option value="optional">Optional (Ask, but allow skip)</option>
                                                <option value="mandatory">Mandatory (Strict ID Verification)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem' }}>
                                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>
                                        <Lock size={14} /> Locked Base Fields
                                    </h4>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 10px 0' }}>
                                        These fields are permanently required for CRM integrity and cannot be removed.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {['First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Gender', 'Programme / Event Type', 'POPIA Consent', 'Marketing Opt-In'].map(f => (
                                            <span key={f} style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                            </div>

                            {/* ─── RIGHT COLUMN: DYNAMIC CUSTOM FIELDS ─── */}
                            <div style={{ flex: '1 1 450px', background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column' }}>
                                <div className="lfm-section-hdr" style={{ marginTop: 0 }}><ListPlus size={13} /> Custom Questions (Dynamic Form)</div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginBottom: '1rem' }}>
                                    Add any extra questions you need for this specific event below. These will be asked to the guest after the locked base fields.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto', maxHeight: '500px', paddingRight: '0.5rem' }}>
                                    {customFields.length === 0 && (
                                        <div style={{ padding: '2rem', textAlign: 'center', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', fontSize: '0.85rem' }}>
                                            No custom questions added.
                                        </div>
                                    )}

                                    {customFields.map((field, idx) => (
                                        <div key={field.id} style={{ background: 'white', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', padding: '1rem', position: 'relative', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                            <button
                                                type="button"
                                                onClick={() => removeCustomField(field.id)}
                                                style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>

                                            <div className="lfm-grid" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
                                                <div className="lfm-fg lfm-fg--full">
                                                    <label>Question {idx + 1} Label</label>
                                                    <input
                                                        className="lfm-input"
                                                        type="text"
                                                        placeholder="e.g. What is your GitHub URL?"
                                                        value={field.label}
                                                        onChange={(e) => updateCustomField(field.id, 'label', e.target.value)}
                                                    />
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'end' }}>
                                                    <div className="lfm-fg">
                                                        <label>Input Type</label>
                                                        <select
                                                            className="lfm-input lfm-select"
                                                            value={field.type}
                                                            onChange={(e) => updateCustomField(field.id, 'type', e.target.value)}
                                                        >
                                                            <option value="text">Short Text</option>
                                                            <option value="dropdown">Dropdown Select</option>
                                                            <option value="checkbox">Yes / No Checkbox</option>
                                                        </select>
                                                    </div>
                                                    <div className="lfm-fg" style={{ paddingBottom: '8px' }}>
                                                        <label className="lfm-checkbox-row" style={{ margin: 0 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={field.required}
                                                                onChange={(e) => updateCustomField(field.id, 'required', e.target.checked)}
                                                            />
                                                            <span style={{ fontWeight: 600 }}>Required</span>
                                                        </label>
                                                    </div>
                                                </div>

                                                {field.type === 'dropdown' && (
                                                    <div className="lfm-fg lfm-fg--full" style={{ marginTop: '0.5rem' }}>
                                                        <label>Dropdown Options (Comma Separated) *</label>
                                                        <input
                                                            className="lfm-input"
                                                            type="text"
                                                            placeholder="e.g. T-Shirt Size S, M, L, XL"
                                                            value={field.options?.join(",") || ""}
                                                            onChange={(e) => updateCustomField(field.id, 'options', e.target.value.split(","))}
                                                        />
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '4px' }}>
                                                            Separate options with a comma.
                                                        </span>
                                                    </div>
                                                )}

                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        className="lfm-btn lfm-btn--ghost"
                                        onClick={addCustomField}
                                        style={{ alignSelf: 'center', marginTop: '1rem' }}
                                    >
                                        <Plus size={14} /> Add Custom Question
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>

                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>
                            Cancel
                        </button>
                        <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
                            {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Event</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

