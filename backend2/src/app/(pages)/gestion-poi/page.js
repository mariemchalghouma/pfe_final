"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  FiSearch,
  FiFilter,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiClock,
  FiGrid,
  FiList,
  FiMap,
  FiUpload,
} from "react-icons/fi";
import PoiModal from "@/components/PoiModal";
import GroupModal from "@/components/GroupModal";
import MapModal from "@/components/map/MapModal";
import { poiAPI, groupsAPI } from "@/services/api";
import * as XLSX from "xlsx";

const GestionPoi = () => {
  const [pois, setPois] = useState([]);
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyActionFilter, setHistoryActionFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("Tous");
  const [activeTab, setActiveTab] = useState("liste");
  const [selectedPoiId, setSelectedPoiId] = useState(null);

  const [showPoiModal, setShowPoiModal] = useState(false);
  const [editingPoi, setEditingPoi] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapPositions, setMapPositions] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");

  const fileInputRef = useRef(null);

  const fetchPois = async () => {
    setLoading(true);
    try {
      const response = await poiAPI.getPOIs();
      setPois(response.data || []);
    } catch (error) {
      console.error("Failed to fetch POIs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await poiAPI.getPOIHistory();
      setHistory(response.data || []);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await groupsAPI.getGroups();
      setGroups(response.data || []);
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    }
  };

  useEffect(() => {
    fetchPois();
    fetchGroups();
  }, []);

  useEffect(() => {
    if (activeTab === "historique") fetchHistory();
  }, [activeTab]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const filteredPois = useMemo(() => {
    return pois.filter((poi) => {
      const matchesSearch = (poi.code || "")
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesGroup = filterGroup === "Tous" || poi.groupe === filterGroup;
      return matchesSearch && matchesGroup;
    });
  }, [search, filterGroup, pois]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const oldDataText = item.old_data
        ? JSON.stringify(item.old_data).toLowerCase()
        : "";
      const newDataText = item.new_data
        ? JSON.stringify(item.new_data).toLowerCase()
        : "";
      const matchesSearch =
        (item.poi_code || "")
          .toLowerCase()
          .includes(historySearch.toLowerCase()) ||
        (item.details || "")
          .toLowerCase()
          .includes(historySearch.toLowerCase()) ||
        oldDataText.includes(historySearch.toLowerCase()) ||
        newDataText.includes(historySearch.toLowerCase());
      const matchesAction =
        historyActionFilter === "ALL" || item.action === historyActionFilter;
      return matchesSearch && matchesAction;
    });
  }, [history, historySearch, historyActionFilter]);

  const historyFields = [
    "code",
    "groupe",
    "type",
    "lat",
    "lng",
    "description",
    "rayon",
    "polygon",
  ];

  const parseHistoryPayload = (payload) => {
    if (!payload) return null;
    if (typeof payload === "object") return payload;
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch {
        return null;
      }
    }
    return null;
  };

  const formatHistoryValue = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const renderHistoryValue = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0 ? `${value.length} point(s)` : "-";
    }
    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }
    return formatHistoryValue(value);
  };

  const historyFieldLabels = {
    code: "Code",
    groupe: "Groupe",
    type: "Type",
    lat: "Latitude",
    lng: "Longitude",
    description: "Description",
    rayon: "Rayon",
    polygon: "Polygone",
  };

  const historyActionMeta = {
    CREATE: {
      label: "Création",
      icon: FiPlus,
      tone: "bg-green-50 text-green-600 border-green-100",
      badge: "bg-green-100 text-green-700",
    },
    UPDATE: {
      label: "Modification",
      icon: FiEdit2,
      tone: "bg-blue-50 text-blue-600 border-blue-100",
      badge: "bg-blue-100 text-blue-700",
    },
    DELETE: {
      label: "Suppression",
      icon: FiTrash2,
      tone: "bg-red-50 text-red-600 border-red-100",
      badge: "bg-red-100 text-red-700",
    },
  };

  const handleSelectPoi = (poi) => {
    const lat = parseFloat(poi.lat);
    const lng = parseFloat(poi.lng);

    if (isNaN(lat) || isNaN(lng)) {
      alert("Ce POI n'a pas de coordonnées valides.");
      return;
    }

    setSelectedPoiId(poi.id);
    const group = groups.find((g) => g.nom === poi.groupe) || {
      couleur: "#3b82f6",
    };
    setMapPositions([
      {
        id: poi.id,
        lat,
        lng,
        label: poi.code,
        color: group.couleur,
        info: `${poi.groupe} · ${poi.description}`,
      },
    ]);
    setIsMapOpen(true);
  };

  const handleOpenFullMap = () => {
    const positions = filteredPois
      .filter(
        (poi) => !isNaN(parseFloat(poi.lat)) && !isNaN(parseFloat(poi.lng)),
      )
      .map((poi) => {
        const group = groups.find((g) => g.nom === poi.groupe) || {
          couleur: "#3b82f6",
        };
        return {
          id: poi.id,
          lat: parseFloat(poi.lat),
          lng: parseFloat(poi.lng),
          label: poi.code,
          color: group.couleur,
          info: `${poi.groupe} · ${poi.description}`,
        };
      });

    if (positions.length === 0) {
      alert("Aucun POI avec des coordonnées valides à afficher sur la carte.");
      return;
    }

    setMapPositions(positions);
    setIsMapOpen(true);
  };

  const handleSavePoi = async (poiData) => {
    try {
      const isEditing = Boolean(editingPoi);

      // Check if group is new
      const groupExists = groups.some((g) => g.nom === poiData.groupe);
      if (!groupExists && poiData.groupe) {
        const couleur = "#fbbf24"; // Default
        await groupsAPI.createGroup({
          nom: poiData.groupe,
          description: poiData.groupeDescription || "",
          couleur,
        });
        await fetchGroups();
      }

      if (isEditing) {
        await poiAPI.updatePOI(editingPoi.id, poiData);
        setSuccessMessage("POI modifié avec succès.");
      } else {
        await poiAPI.createPOI(poiData);
        setSuccessMessage("POI ajouté avec succès.");
      }
      setShowPoiModal(false);
      setEditingPoi(null);
      await fetchPois();
    } catch (error) {
      console.error("Failed to save POI:", error);
    }
  };

  const handleDeletePoi = async (id) => {
    if (window.confirm("Voulez-vous vraiment supprimer ce POI ?")) {
      try {
        await poiAPI.deletePOI(id);
        setSuccessMessage("POI supprimé avec succès.");
        await fetchPois();
      } catch (error) {
        console.error("Failed to delete POI:", error);
      }
    }
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        for (const row of data) {
          await poiAPI.createPOI({
            code: row.Code || row.code || row.Nom || row.nom,
            groupe: row.Groupe || row.groupe || "Tous",
            type: row.Type || row.type || "Point",
            lat: row.Lat || row.lat,
            lng: row.Lng || row.lng,
            description:
              row.Description ||
              row.description ||
              row.Adresse ||
              row.adresse ||
              "",
          });
        }
        alert(`${data.length} POI importés avec succès !`);
        fetchPois();
      } catch (error) {
        console.error("Excel import failed:", error);
        alert("Erreur lors de l'importation. Vérifiez le format du fichier.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleSaveGroup = async (groupData) => {
    try {
      if (editingGroup) {
        await groupsAPI.updateGroup(editingGroup.id, groupData);
        setSuccessMessage("Groupe modifié avec succès.");
      } else {
        await groupsAPI.createGroup(groupData);
        setSuccessMessage("Groupe ajouté avec succès.");
      }
      setShowGroupModal(false);
      setEditingGroup(null);
      await fetchGroups();
    } catch (error) {
      console.error("Failed to save group:", error);
    }
  };

  const handleEditGroupClick = (group) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const handleDeleteGroup = async (groupId) => {
    if (window.confirm("Voulez-vous vraiment supprimer ce groupe ?")) {
      try {
        await groupsAPI.deleteGroup(groupId);
        setSuccessMessage("Groupe supprimé avec succès.");
        await fetchGroups();
      } catch (error) {
        console.error("Failed to delete group:", error);
      }
    }
  };

  return (
    <>
      <div className="p-4 px-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/30">
        {successMessage && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-6 p-1">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
              />
            </div>
            <div className="relative">
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 border-none cursor-pointer font-medium"
              >
                <option value="Tous">Tous les groupes</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.nom}>
                    {g.nom}
                  </option>
                ))}
              </select>
              <FiFilter className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="flex items-center gap-2 pr-4 border-r border-gray-100 mr-2">
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">
                  Total POI
                </p>
                <p className="text-xl font-black text-gray-900 leading-tight">
                  {filteredPois.length}
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenFullMap}
              className="p-2.5 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-100"
              title="Voir sur la carte"
            >
              <FiMap className="text-lg" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportExcel}
              accept=".xlsx, .xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100"
            >
              <FiUpload className="text-lg" /> Importer Excel
            </button>
            <button
              onClick={() => setShowPoiModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
            >
              <FiPlus className="text-lg" /> Nouveau POI
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-gray-100 text-sm font-medium mb-8">
          <button
            onClick={() => setActiveTab("liste")}
            className={`pb-4 transition-all flex items-center gap-2 relative ${activeTab === "liste" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500 hover:text-gray-700"}`}
          >
            <FiList /> Liste des POI
          </button>
          <button
            onClick={() => setActiveTab("groupes")}
            className={`pb-4 transition-all flex items-center gap-2 relative ${activeTab === "groupes" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500 hover:text-gray-700"}`}
          >
            <FiGrid /> Groupes
          </button>
          <button
            onClick={() => setActiveTab("historique")}
            className={`pb-4 transition-all flex items-center gap-2 relative ${activeTab === "historique" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500 hover:text-gray-700"}`}
          >
            <FiClock /> Historique
          </button>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
          {activeTab === "liste" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Code du POI
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Groupe
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Type
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Localisation
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPois.map((poi) => {
                    const group = groups.find((g) => g.nom === poi.groupe) || {
                      nom: poi.groupe,
                      couleur: "#94a3b8",
                    };
                    return (
                      <tr
                        key={poi.id}
                        onClick={() => handleSelectPoi(poi)}
                        className={`group cursor-pointer transition-all hover:bg-gray-50/50 ${selectedPoiId === poi.id ? "ring-2 ring-inset ring-orange-200" : ""}`}
                      >
                        <td className="px-6 py-2 whitespace-nowrap">
                          <span className="font-semibold text-gray-900 text-sm">
                            {poi.code}
                          </span>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border"
                            style={{
                              backgroundColor: `${group.couleur}10`, // 10% opacity
                              color: group.couleur,
                              borderColor: `${group.couleur}30`, // 30% opacity
                            }}
                          >
                            {poi.groupe}
                          </span>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 bg-gray-100 rounded-full text-[10px] font-semibold text-gray-700">
                            {poi.type}
                          </span>
                        </td>
                        <td className="px-6 py-2 text-gray-500 max-w-xs truncate font-medium">
                          <div className="flex flex-col">
                            <span className="truncate">
                              {poi.description || "N/A"}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold mt-0.5">
                              {poi.lat}, {poi.lng}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-2">
                          <div className="flex items-center gap-2 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPoi(poi);
                                setShowPoiModal(true);
                              }}
                              className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-orange-600 hover:border-orange-200 transition-all shadow-sm"
                              title="Modifier"
                            >
                              <FiEdit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePoi(poi.id);
                              }}
                              className="p-2 bg-white border border-gray-200 rounded-lg text-red-600 hover:text-red-700 hover:border-red-200 transition-all shadow-sm"
                              title="Supprimer"
                            >
                              <FiTrash2 size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPoi(poi);
                              }}
                              className="p-2 bg-white border border-gray-200 rounded-lg text-blue-600 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
                              title="Détails"
                            >
                              <FiMap size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "groupes" && (
            <div className="px-8 py-8 max-w-7xl mx-auto">
              <div className="flex justify-end items-center mb-5">
                <button
                  onClick={() => {
                    setEditingGroup(null);
                    setShowGroupModal(true);
                  }}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-orange-500/20 active:scale-95"
                >
                  <FiPlus className="text-base" /> Nouveau groupe
                </button>
              </div>

              {groups.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groups.map((group) => {
                    const count = pois.filter(
                      (p) => p.groupe === group.nom,
                    ).length;
                    return (
                      <div
                        key={group.id}
                        className="group relative bg-white border border-gray-200 rounded-xl p-3.5 hover:border-orange-200 hover:shadow-sm transition-all duration-200 overflow-hidden"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div
                            className="w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: group.couleur }}
                          />
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                              onClick={() => handleEditGroupClick(group)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-all"
                              title="Modifier"
                            >
                              <FiEdit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(group.id)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded transition-all"
                              title="Supprimer"
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="mb-2.5">
                          <h3 className="text-[15px] font-extrabold text-gray-900 mb-0.5 tracking-tight leading-tight">
                            {group.nom}
                          </h3>
                          <p className="text-[13px] text-gray-500 line-clamp-1 leading-tight">
                            {group.description || "Aucune description"}
                          </p>
                        </div>

                        <div className="pt-2.5 border-t border-gray-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                Points rattachés
                              </p>
                              <p className="text-[17px] font-black text-gray-900 leading-none">
                                {count}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl border border-gray-200/50">
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-lg border border-gray-100">
                    <FiGrid className="text-3xl text-gray-400" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900 mb-2">
                    Aucun groupe créé
                  </h3>
                  <p className="text-gray-500 text-sm mb-8 text-center max-w-xs">
                    Commencez par créer votre premier groupe pour organiser vos
                    points d&apos;intérêt
                  </p>
                  <button
                    onClick={() => setShowGroupModal(true)}
                    className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-orange-200 text-gray-900 hover:text-orange-600 px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                  >
                    <FiPlus /> Créer un groupe
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "historique" && (
            <div className="px-6 py-8">
              <div className="mb-8 flex flex-wrap items-center gap-4">
                <div className="relative w-full sm:w-80">
                  <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                  <input
                    type="text"
                    placeholder="Rechercher par code ou nom..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[12px] font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-200 transition-all w-full shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
                  {[
                    { key: "ALL", label: "Tout" },
                    { key: "CREATE", label: "Création" },
                    { key: "UPDATE", label: "Modification" },
                    { key: "DELETE", label: "Suppression" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setHistoryActionFilter(option.key)}
                      className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${historyActionFilter === option.key ? "bg-orange-500 text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(
                    filteredHistory.reduce((acc, item) => {
                      const dateLabel = new Date(
                        item.created_at,
                      ).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      });
                      if (!acc[dateLabel]) acc[dateLabel] = [];
                      acc[dateLabel].push(item);
                      return acc;
                    }, {}),
                  ).map(([date, items]) => (
                    <div key={date} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                          {date}
                        </span>
                        <div className="h-px bg-gray-50 flex-1"></div>
                      </div>
                      {items.map((item) => {
                        const oldData = parseHistoryPayload(item.old_data);
                        const newData = parseHistoryPayload(item.new_data);
                        const displayTitle =
                          oldData?.code ||
                          newData?.code ||
                          item.poi_code ||
                          "POI";
                        const displaySubtitle =
                          item.details ||
                          (item.action === "CREATE"
                            ? "Nouveau POI créé"
                            : item.action === "DELETE"
                              ? "POI supprimé"
                              : "POI modifié");

                        const iconBg =
                          item.action === "CREATE"
                            ? "bg-green-50 text-green-600"
                            : item.action === "UPDATE"
                              ? "bg-blue-50 text-blue-600"
                              : "bg-red-50 text-red-600";
                        const badgeClasses =
                          item.action === "CREATE"
                            ? "bg-green-100 text-green-700"
                            : item.action === "UPDATE"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700";
                        const badgeLabel =
                          item.action === "CREATE"
                            ? "CRÉATION"
                            : item.action === "UPDATE"
                              ? "MODIFICATION"
                              : "SUPPRESSION";

                        return (
                          <div
                            key={item.id}
                            className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-sm transition-all"
                          >
                            <div className="flex items-start gap-4">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
                              >
                                {item.action === "CREATE" ? (
                                  <FiPlus size={16} />
                                ) : item.action === "UPDATE" ? (
                                  <FiEdit2 size={16} />
                                ) : (
                                  <FiTrash2 size={16} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-3 mb-2">
                                  <div className="min-w-0">
                                    <h4 className="text-[13px] font-black text-gray-900 tracking-tight">
                                      {displayTitle}
                                    </h4>
                                    <p className="text-[11px] font-medium text-gray-500 mt-1">
                                      {displaySubtitle}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter flex-shrink-0 ${badgeClasses}`}
                                  >
                                    {badgeLabel}
                                  </span>
                                </div>

                                {(item.action === "UPDATE" ||
                                  item.action === "DELETE") &&
                                  oldData &&
                                  newData && (
                                    <div className="mt-3 space-y-2 pt-3 border-t border-gray-50">
                                      {historyFields.map((field) => {
                                        const oldVal = oldData?.[field];
                                        const newVal = newData?.[field];
                                        if (
                                          JSON.stringify(oldVal) ===
                                          JSON.stringify(newVal)
                                        ) {
                                          return null;
                                        }
                                        return (
                                          <div
                                            key={field}
                                            className="flex flex-wrap items-start gap-1.5 text-[11px] leading-5"
                                          >
                                            <span className="font-bold text-gray-700 min-w-fit">
                                              {historyFieldLabels[field]}:
                                            </span>
                                            <span className="text-gray-400 line-through decoration-gray-300">
                                              {renderHistoryValue(oldVal)}
                                            </span>
                                            <span className="text-gray-300">
                                              →
                                            </span>
                                            <span className="font-bold text-gray-900">
                                              {renderHistoryValue(newVal)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5 uppercase mt-3">
                                  <FiClock size={10} />
                                  {new Date(item.created_at).toLocaleTimeString(
                                    "fr-FR",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                  {item.user_name ? (
                                    <span>• {item.user_name}</span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 border border-gray-100">
                    <FiClock className="text-2xl text-gray-300" />
                  </div>
                  <h3 className="text-[13px] font-black text-gray-900">
                    Aucun résultat d&apos;audit
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Aucune modification ne correspond à vos filtres.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        positions={mapPositions}
        title={
          mapPositions.length === 1
            ? `Localisation : ${mapPositions[0].label}`
            : "Points d'intérêt"
        }
      />

      {showPoiModal && (
        <PoiModal
          isOpen={showPoiModal}
          onClose={() => {
            setShowPoiModal(false);
            setEditingPoi(null);
          }}
          groups={groups}
          initialData={editingPoi}
          onSubmit={handleSavePoi}
        />
      )}

      {showGroupModal && (
        <GroupModal
          key={editingGroup?.id || "new-group"}
          isOpen={showGroupModal}
          onClose={() => {
            setShowGroupModal(false);
            setEditingGroup(null);
          }}
          initialData={editingGroup}
          onSubmit={handleSaveGroup}
        />
      )}
    </>
  );
};

export default GestionPoi;
