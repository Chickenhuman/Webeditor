import { createId } from "./config.js";
import { toSafeText } from "./sanitize.js";

export function createCharacterController({
    elements,
    getCharacters,
    setCharacters,
    saveCharacters,
    setHidden,
    showToast,
    performSave,
}) {
    let selectedCharacterId = null;

    function renderCharacterList() {
        elements.characterList.replaceChildren();
        getCharacters().forEach((character) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = `char-item ${character.id === selectedCharacterId ? "active" : ""}`;
            item.dataset.id = character.id;
            item.dataset.action = "select-character";

            const avatar = document.createElement("span");
            avatar.className = "char-avatar";
            avatar.textContent = character.name?.[0] || "?";

            const info = document.createElement("span");
            info.className = "char-info";
            const name = document.createElement("strong");
            name.textContent = character.name || "이름 없음";
            const role = document.createElement("small");
            role.textContent = character.role || "역할 미정";
            info.append(name, role);

            item.append(avatar, info);
            elements.characterList.appendChild(item);
        });
    }

    function openCharacterModal() {
        elements.characterModal.classList.add("open");
        renderCharacterList();
    }

    function selectCharacter(id) {
        selectedCharacterId = id;
        const character = getCharacters().find((item) => item.id === id);
        if (!character) return;

        setHidden(elements.charDetailForm, false);
        setHidden(elements.charEmptyState, true);
        elements.charName.value = character.name || "";
        elements.charAge.value = character.age || "";
        elements.charRole.value = character.role || "";
        elements.charAppearance.value = character.appearance || "";
        elements.charPersonality.value = character.personality || "";
        renderCharacterList();
    }

    function addNewCharacter() {
        const characters = getCharacters();
        const character = {
            id: createId("character"),
            name: "새 캐릭터",
            age: "",
            role: "",
            appearance: "",
            personality: "",
        };
        characters.push(character);
        saveCharacters(characters);
        selectCharacter(character.id);
    }

    function saveCurrentCharacter() {
        const character = getCharacters().find((item) => item.id === selectedCharacterId);
        if (!character) return;

        character.name = toSafeText(elements.charName.value);
        character.age = toSafeText(elements.charAge.value);
        character.role = toSafeText(elements.charRole.value);
        character.appearance = toSafeText(elements.charAppearance.value);
        character.personality = toSafeText(elements.charPersonality.value);
        saveCharacters(getCharacters());
        renderCharacterList();
        showToast("캐릭터 설정이 저장되었습니다.");
    }

    function deleteCurrentCharacter() {
        if (!selectedCharacterId || !window.confirm("선택한 테스트 캐릭터를 삭제할까요?")) return;
        const characters = getCharacters().filter((character) => character.id !== selectedCharacterId);
        selectedCharacterId = null;
        setCharacters(characters);
        saveCharacters(characters);
        renderCharacterList();
        setHidden(elements.charDetailForm, true);
        setHidden(elements.charEmptyState, false);
    }

    function bindEvents() {
        elements.btnCloseCharacters.addEventListener("click", () => {
            elements.characterModal.classList.remove("open");
            performSave();
        });
        elements.btnAddCharacter.addEventListener("click", addNewCharacter);
        elements.characterList.addEventListener("click", (event) => {
            const item = event.target.closest("[data-action='select-character']");
            if (item) selectCharacter(item.dataset.id);
        });
        elements.btnSaveCharacter.addEventListener("click", saveCurrentCharacter);
        elements.btnDeleteCharacter.addEventListener("click", deleteCurrentCharacter);
    }

    return {
        bindEvents,
        openCharacterModal,
        renderCharacterList,
    };
}
