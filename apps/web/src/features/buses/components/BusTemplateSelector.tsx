import type { BusTemplate } from '../types/busTemplate.types';
import './BusTemplateSelector.css';

interface BusTemplateSelectorProps {
  templates: BusTemplate[];
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
}

export function BusTemplateSelector({
  templates,
  selectedTemplateId,
  onSelect,
}: BusTemplateSelectorProps) {
  return (
    <div className="bus-template-selector" role="group" aria-label="Diseño del bus">
      {templates.map((template) => (
        <button
          className={`bus-template-selector__option${
            template.id === selectedTemplateId ? ' bus-template-selector__option--selected' : ''
          }`}
          key={template.id}
          type="button"
          aria-pressed={template.id === selectedTemplateId}
          onClick={() => onSelect(template.id)}
        >
          <span className="bus-template-selector__name">{template.name}</span>
          <span className="bus-template-selector__details">
            {template.floors} {template.floors === 1 ? 'piso' : 'pisos'} · {template.seats.length}{' '}
            asientos
          </span>
        </button>
      ))}
    </div>
  );
}
